import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import LoginScreen from './LoginScreen';
import S2_Dashboard from './S2_Dashboard';
import S3_RocketLibrary from './S3_RocketLibrary';
import S4_RocketEditor from './S4_RocketEditor';
import S5_MissionConfig from './S5_MissionConfig';
import S5b_ActuatorLibrary from './S5b_ActuatorLibrary';
import S6_Simulation from './S6_Simulation';
import S8a_StateEstimation from './S8a_StateEstimation';
import S8b_ControlWorkbench from './S8b_ControlWorkbench';
import S8c_GuidanceDesign from './S8c_GuidanceDesign';
import S11_MonteCarlo from './S11_MonteCarlo';
import S13_HardwareHealth from './S13_HardwareHealth';
import S14_PreLaunchChecklist from './S14_PreLaunchChecklist';
import S15_LaunchControl from './S15_LaunchControl';
import S16_LiveFlightMonitor from './S16_LiveFlightMonitor';
import S17_PostFlightAnalysis from './S17_PostFlightAnalysis';
import S18_FlightReplay from './S18_FlightReplay';
import S19_FirmwareUpdateConsole from './S19_FirmwareUpdateConsole';
import S20_SystemSettings from './S20_SystemSettings';
import S21_AuditTrail from './S21_AuditTrail';
import S22_ComparisonTool from './S22_ComparisonTool';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginScreen />} />
        <Route path="/launch" element={<S15_LaunchControl />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<S2_Dashboard />} />
          <Route path="/library" element={<S3_RocketLibrary />} />
          <Route path="/editor" element={<S4_RocketEditor />} />
          <Route path="/mission" element={<S5_MissionConfig />} />
          <Route path="/actuators" element={<S5b_ActuatorLibrary />} />
          <Route path="/simulation" element={<S6_Simulation />} />
          <Route path="/estimation" element={<S8a_StateEstimation />} />
          <Route path="/workbench" element={<S8b_ControlWorkbench />} />
          <Route path="/guidance" element={<S8c_GuidanceDesign />} />
          <Route path="/monte-carlo" element={<S11_MonteCarlo />} />
          <Route path="/health" element={<S13_HardwareHealth />} />
          <Route path="/checklist" element={<S14_PreLaunchChecklist />} />
          <Route path="/monitor" element={<S16_LiveFlightMonitor />} />
          <Route path="/post-flight" element={<S17_PostFlightAnalysis />} />
          <Route path="/replay" element={<S18_FlightReplay />} />
          <Route path="/firmware" element={<S19_FirmwareUpdateConsole />} />
          <Route path="/settings" element={<S20_SystemSettings />} />
          <Route path="/audit" element={<S21_AuditTrail />} />
          <Route path="/comparison" element={<S22_ComparisonTool />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

