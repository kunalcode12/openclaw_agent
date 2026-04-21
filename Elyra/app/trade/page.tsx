import TradingChart from "@/components/TradingChart";
import { tradingDummyData, tradingDummyToken } from "@/lib/tradeDummyData";

export default function Page() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0b0e11" }}>
      <TradingChart tokenInfo={tradingDummyToken} data={tradingDummyData} interval="1h" />
    </div>
  );
}
