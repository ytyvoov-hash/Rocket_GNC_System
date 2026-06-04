import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import rocketReducer from './rocketSlice';
import telemetryReducer from './telemetrySlice';
import systemReducer from './systemSlice';
import missionReducer from './missionSlice';
import hardwareReducer from './hardwareSlice';
import actuatorLibraryReducer from './actuatorLibrarySlice';
import controllerLibraryReducer from './controllerLibrarySlice';
import estimatorLibraryReducer from './estimatorLibrarySlice';
import guidanceLibraryReducer from './guidanceLibrarySlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    rocket: rocketReducer,
    telemetry: telemetryReducer,
    system: systemReducer,
    mission: missionReducer,
    hardware: hardwareReducer,
    actuatorLibrary: actuatorLibraryReducer,
    controllerLibrary: controllerLibraryReducer,
    estimatorLibrary: estimatorLibraryReducer,
    guidanceLibrary: guidanceLibraryReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
