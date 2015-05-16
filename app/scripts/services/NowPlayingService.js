/**
 * TODO:
 *
 * - upnext track order are not stored correct in DB. Relative track's order is not updated
 * 
 */

(function(){
    'use strict';

    angular.module('soundCloudify')
        .service("NowPlaying", NowPlayingService);

    var ORIGIN_LOCAL = 'l';
    var ORIGIN_SERVER = 's';

    var DEFAULT_STATE = {
        currentTrack: false,
        currentIndex: 0,
        playing: false,
        currentTime: 0,
        duration: 0,
        volume: 0.5,
        repeat: 0,
        shuffle: false,
        scrobbleEnabled: false,
        scrobbled: false,
        lastFmInvalid: false
    };

    function NowPlayingService($http, $q, CLIENT_ID, $rootScope, API_ENDPOINT, SyncService, StorageService){

        var nowplaying = {
            trackIds: JSON.parse(localStorage.getItem('nowplaying')) || []
        };

        var state = JSON.parse(localStorage.getItem('playerstate')) || DEFAULT_STATE;
        state.playing = false;
        state.currentTime = 0;

        //Storage API for simplify IndexedDB interaction
        var Storage = StorageService.getStorageInstance('nowplaying');

        $rootScope.$on('sync.completed', function() {
            loadNowPlayingList();
        });

        loadNowPlayingList();

        return {
            getTrackIds: getTrackIds,
            getTrack: getTrack,
            getTracks: getTracks,
            addTrack: addTrack,
            addTracks: addTracks,
            removeTrack: removeTrack,
            removeAllTracks: removeAllTracks,
            getState: getState,
            saveState: saveState
        };

        function loadNowPlayingList() {
            getTracks().then(function(tracks) {
                var trackIds = _.map(tracks, function(track) {
                    return track.uuid;
                });
                _saveTrackIds(trackIds);
            });
        }

        function getTrackIds() {
            return nowplaying;
        }

        function getTrack(uuid) {
            return Storage.getById(uuid);
        }

        function getTracks(callback){
            return Storage.getTracks();
        }

        /**
         * Add a single track to nowplaying list
         */
        function addTrack(track, position) {

            return $q(function(resolve, reject) {

                //we need to do a copy here to ensure each track we add
                //to the playlist will have a unique id
                track = angular.copy(track);
                track.uuid = window.ServiceHelpers.ID();
                track.sync = 0;
                track.deleted = 0;

                var insertAtUuid;

                if (position && nowplaying.trackIds.length >= 1 ) {
                    insertAtUuid = nowplaying.trackIds[position];
                } else {
                    insertAtUuid = nowplaying.trackIds[0];
                }

                if (insertAtUuid) {
                    Storage.getById(insertAtUuid)
                        .then(function(trackAtPosition) {

                            track.order = trackAtPosition.order + 1;
                            Storage.insert(track);

                            if (typeof position !== 'undefined') {
                                
                                nowplaying.trackIds.splice(position, 0, track.uuid);

                                var tobeUpsert = _.filter(nowplaying.trackIds, function(uuid, index) {
                                    return index < position;
                                });

                                if (tobeUpsert.length) {
                                    Storage.increaseOrder(tobeUpsert);
                                }

                                _saveTrackIds(nowplaying.trackIds);
                                SyncService.push().then(SyncService.bumpLastSynced);
                                resolve();
                            } else {
                                nowplaying.trackIds.unshift(track.uuid);

                                _saveTrackIds(nowplaying.trackIds);
                                SyncService.push().then(SyncService.bumpLastSynced);
                                resolve();
                            }
                        });
                } else {
                    track.order = 0;
                    nowplaying.trackIds.unshift(track.uuid);
                    Storage.insert(track);

                    _saveTrackIds(nowplaying.trackIds);
                    SyncService.push().then(SyncService.bumpLastSynced);
                    resolve();
                }


            });
        }

        /**
         * Add multiple tracks to nowplaying
         */
        function addTracks(tracks) {

            return $q(function(resolve, reject) {

                removeAllTracks(false).then(function() {

                    var tracksToAdd = _.map(tracks, function(track, index) {
                        track = angular.copy(track);
                        track.uuid = window.ServiceHelpers.ID();
                        track.sync = 0;
                        track.deleted = 0;
                        track.order = tracks.length - 1 - index;
                        return track;
                    });

                    nowplaying.trackIds = _.map(tracksToAdd, function(track) {
                        return track.uuid;
                    });

                    _saveTrackIds(nowplaying.trackIds);

                    Storage.insert(tracksToAdd);

                    SyncService.push().then(SyncService.bumpLastSynced);

                    resolve();
                });

            });

        }

        /**
         * Remove track from now playing
         */
        function removeTrack(position) {

            return $q(function(resolve, reject) {
                
                var uuid = nowplaying.trackIds[position];

                Storage.getById(uuid)
                    .then(function(track) {
                        if (!track) reject();

                        if (track) {
                            nowplaying.trackIds.splice(position, 1);

                            //mark the track as deleted for the SyncService to know how to handle it
                            track.deleted = 1;
                            track.sync = 0;
                            Storage.upsert([track]);
                        }

                        _saveTrackIds(nowplaying.trackIds);

                        SyncService.push().then(SyncService.bumpLastSynced);

                        resolve();
                    });
                
            });
        }

        /**
         * Remove all tracks from nowplaying
         */
        function removeAllTracks(triggerSync) {

            return $q(function(resolve, reject) {
                
                triggerSync = typeof triggerSync === 'undefined' ? true : triggerSync;

                Storage.markAllTracksAsDeleted()
                    .then(function() {
                        nowplaying.trackIds = [];

                        _saveTrackIds([]);

                        if (triggerSync) {
                            SyncService.push().then(SyncService.bumpLastSynced);
                        }

                        resolve();
                    });
            });
        }

        /**
         * Save state
         */
        function saveState(newState) {
            if (newState) {
                state = newState;
                localStorage.setItem('playerstate', JSON.stringify(newState));
            }
        }

        function _saveTrackIds(trackIds) {
            if (trackIds) {
                nowplaying.trackIds = trackIds;
                localStorage.setItem('nowplaying', JSON.stringify(trackIds));
            }
        }

        /**
         * Get the state getting from the background
         */
        function getState(callback) {
            return state;
        }
    };

}());