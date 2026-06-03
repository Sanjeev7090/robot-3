import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import TradingDashboard from "@/components/TradingDashboard";
import { ThemeProvider } from "@/context/ThemeContext";

function App() {
  return (
    <ThemeProvider>
      <div className="App">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<TradingDashboard />} />
          </Routes>
        </BrowserRouter>
      </div>
    </ThemeProvider>
  );
}

export default App;
