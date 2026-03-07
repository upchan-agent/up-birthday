import { useState, useEffect } from 'react';
import { ERC725 } from '@erc725/erc725.js';
import { createClientUPProvider } from '@lukso/up-provider';

// LSP3 Schema
const LSP3Schema = [
  {
    name: 'LSP3Profile',
    key: '0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5',
    keyType: 'Singleton',
    valueType: 'bytes',
    valueContent: 'JSONURL',
  },
];

interface ProfileData {
  name: string;
  avatarUrl?: string;
}

interface BirthdayData {
  timestamp: string;
  utc: string;
  local: string;
  txHash: string;
  txUrl: string;
}

function App() {
  const [address, setAddress] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [birthday, setBirthday] = useState<BirthdayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // UP Provider の初期化
    const provider = createClientUPProvider();

    // 初期接続状態を取得
    const accounts = provider.accounts as string[];
    const contextAccounts = provider.contextAccounts as string[];

    // Grid 経由の場合は contextAccounts を使用
    const upAddress = contextAccounts.length > 0 ? contextAccounts[0] : accounts[0];

    if (upAddress) {
      setAddress(upAddress);
      fetchProfile(upAddress);
      fetchBirthday(upAddress);
    }

    // イベントリスナー設定
    const handleAccountsChanged = (newAccounts: string[]) => {
      if (newAccounts.length > 0) {
        setAddress(newAccounts[0]);
        fetchProfile(newAccounts[0]);
        fetchBirthday(newAccounts[0]);
      }
    };

    const handleContextAccountsChanged = (newContextAccounts: string[]) => {
      if (newContextAccounts.length > 0) {
        setAddress(newContextAccounts[0]);
        fetchProfile(newContextAccounts[0]);
        fetchBirthday(newContextAccounts[0]);
      }
    };

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('contextAccountsChanged', handleContextAccountsChanged);

    return () => {
      provider.removeListener('accountsChanged', handleAccountsChanged);
      provider.removeListener('contextAccountsChanged', handleContextAccountsChanged);
    };
  }, []);

  const fetchProfile = async (addr: string) => {
    try {
      const erc725 = new ERC725(
        LSP3Schema,
        addr,
        'https://rpc.mainnet.lukso.network',
        {
          ipfsGateway: 'https://api.universalprofile.cloud/ipfs',
        }
      );

      const result = await erc725.fetchData('LSP3Profile');
      const profileData = result.value as { name?: string; description?: string; links?: Array<{ title: string; url: string }>; profileImage?: Array<{ url: string }> };

      setProfile({
        name: profileData.name || 'Unknown',
        avatarUrl: profileData.profileImage?.[0]?.url,
      });
    } catch (e) {
      console.error('Failed to fetch profile:', e);
      setProfile({ name: 'Unknown' });
    }
  };

  const fetchBirthday = async (addr: string) => {
    setLoading(true);
    setError(null);
    try {
      const addrRes = await fetch(
        `https://explorer.execution.mainnet.lukso.network/api/v2/addresses/${addr}`
      );
      const addrData = await addrRes.json();

      const txHash = addrData.creation_transaction_hash;
      if (!txHash) {
        throw new Error('Not found the creation transaction');
      }

      const txRes = await fetch(
        `https://explorer.execution.mainnet.lukso.network/api/v2/transactions/${txHash}`
      );
      const txData = await txRes.json();

      const createdAt = new Date(txData.timestamp);

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
      <h2 style={{ marginBottom: '16px', textAlign: 'center' }}>
        <span style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>🎂</span> UP Birthday
      </h2>

      {/* プロフィール表示 */}
      {profile && (
        <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>Universal Profile</div>
            <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{profile.name}</div>
          </div>
        </div>
      )}

      {/* アドレス表示 */}
      {address && (
        <div style={{ marginBottom: '20px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '0.75rem', wordBreak: 'break-all', textAlign: 'center' }}>
          <span style={{ color: '#888' }}>Address: </span>
          <span style={{ color: '#ff0055' }}>{address}</span>
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div style={{ padding: '15px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <p style={{ margin: 0 }}>🎈 Checking your birthday...</p>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,0,85,0.1)', borderRadius: '12px' }}>
          <p style={{ margin: 0, color: '#d00' }}>⚠️ {error}</p>
        </div>
      )}

      {/* 誕生日情報 */}
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

      {!address && !loading && (
        <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#666' }}>Connecting to Universal Profile...</p>
        </div>
      )}
    </div>
  );
}

export default App;
