import { OpenCvProvider } from "opencv-react";
import Track from "./Track";

function App() {
  return (
    <OpenCvProvider>
      <Track />
    </OpenCvProvider>
  );
}

export default App;
