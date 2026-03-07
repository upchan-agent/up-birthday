import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

interface BirthdayData {
  timestamp: string;
  utc: string;
  local: string;
  txHash: string;
  txUrl: string;
}

function App() {
  const { address, isConnected } = useAccount();
  const [birthday, setBirthday] = useState<BirthdayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected && address) {
      fetchBirthday(address);
    }
  }, [address, isConnected]);

  const fetchBirthday = async (addr: string) => {
    setLoading(true);
    setError(null);
    try {
      // ① アドレス情報を Explorer API から取得
      const addrRes = await fetch(
        `https://explorer.execution.mainnet.lukso.network/api/v2/addresses/${addr}`
      );
      const addrData = await addrRes.json();

      const txHash = addrData.creation_transaction_hash;
      if (!txHash) {
        throw new Error('Not found the creation transaction');
      }

      // ② 作成トランザクションの詳細を取得
      const txRes = await fetch(
        `https://explorer.execution.mainnet.lukso.network/api/v2/transactions/${txHash}`
      );
      const txData = await txRes.json();

      const createdAt = new Date(txData.timestamp);

      // ③ 結果をセット
      setBirthday({
        timestamp: txData.timestamp,
        utc: createdAt.toUTCString(),
        local: createdAt.toLocaleString(),
        txHash,
        txUrl: `https://explorer.execution.mainnet.lukso.network/tx/${txHash}`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '16px' }}>
        <span style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>🎂</span> Your UP Birthday
      </h2>
      
      <ConnectButton />

      {!isConnected && (
        <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#666' }}>Connect your Universal Profile to see your birthday 🎉</p>
        </div>
      )}

      {loading && (
        <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <p style={{ margin: 0 }}>🎈 Checking your birthday...</p>
        </div>
      )}

      {error && (
        <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,0,85,0.1)', borderRadius: '12px' }}>
          <p style={{ margin: 0, color: '#d00' }}>⚠️ {error}</p>
        </div>
      )}

      {birthday && (
        <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px' }}>
          <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
            <span style={{ fontSize: '0.75rem', color: '#666', display: 'block' }}>🎉 Created At (UTC)</span>
            <b>{birthday.utc}</b>
          </div>
          <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
            <span style={{ fontSize: '0.75rem', color: '#666', display: 'block' }}>🕐 Local Time</span>
            <b>{birthday.local}</b>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#666', display: 'block' }}>📝 Creation Transaction</span>
            <a href={birthday.txUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#ff0055', wordBreak: 'break-all' }}>
              {birthday.txHash}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
