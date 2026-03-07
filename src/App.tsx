import { useState, useEffect } from 'react';
import { createClientUPProvider } from '@lukso/up-provider';

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

// IPFS ゲートウェイ候補
const IPFS_GATEWAYS = [
  'https://api.universalprofile.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

function App() {
  const [address, setAddress] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [birthday, setBirthday] = useState<BirthdayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const provider = createClientUPProvider();

    const accounts = provider.accounts as string[];
    const contextAccounts = provider.contextAccounts as string[];

    const upAddress = contextAccounts.length > 0 ? contextAccounts[0] : accounts[0];

    if (upAddress) {
      setAddress(upAddress);
      fetchProfile(upAddress);
      fetchBirthday(upAddress);
    }

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
      // LSP3Profile のデータキー
      const LSP3_KEY = '0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5';

      // データを取得
      const response = await fetch('https://rpc.mainnet.lukso.network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getData',
          params: [addr, LSP3_KEY],
        }),
      });

      const data = await response.json();
      
      if (!data.result || data.result === '0x') {
        setProfile({ name: 'Unknown' });
        return;
      }

      // VerifiableURI をデコード
      const decoded = decodeVerifiableURI(data.result);
      console.log('Decoded URI:', decoded);

      if (!decoded.url) {
        setProfile({ name: 'Unknown' });
        return;
      }

      // IPFS URL をゲートウェイ URL に変換
      let jsonUrl = decoded.url;
      if (jsonUrl.startsWith('ipfs://')) {
        // 複数のゲートウェイを試す
        for (const gateway of IPFS_GATEWAYS) {
          try {
            const testUrl = gateway + jsonUrl.replace('ipfs://', '');
            const testRes = await fetch(testUrl, { method: 'HEAD' });
            if (testRes.ok) {
              jsonUrl = testUrl;
              break;
            }
          } catch {
            continue;
          }
        }
        // 全部ダメだったらデフォルト
        if (jsonUrl.startsWith('ipfs://')) {
          jsonUrl = IPFS_GATEWAYS[0] + jsonUrl.replace('ipfs://', '');
        }
      }

      console.log('Fetching profile from:', jsonUrl);

      // プロフィール JSON を取得
      const profileRes = await fetch(jsonUrl);
      const profileJson = await profileRes.json();
      console.log('Profile JSON:', profileJson);

      const lsp3Data = profileJson.LSP3Profile || profileJson;

      // プロフィール画像の URL を取得
      let avatarUrl: string | undefined;
      if (lsp3Data.profileImage && Array.isArray(lsp3Data.profileImage) && lsp3Data.profileImage.length > 0) {
        const img = lsp3Data.profileImage[0];
        if (img.url && typeof img.url === 'string') {
          if (img.url.startsWith('ipfs://')) {
            avatarUrl = IPFS_GATEWAYS[0] + img.url.replace('ipfs://', '');
          } else if (img.url.startsWith('https://') || img.url.startsWith('http://')) {
            avatarUrl = img.url;
          }
        }
      }

      console.log('Avatar URL:', avatarUrl);
      console.log('Name:', lsp3Data.name);

      setProfile({
        name: lsp3Data.name || 'Unknown',
        avatarUrl,
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

      {profile && (
        <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', background: '#333' }}
              onError={(e) => {
                console.log('Image load error:', e);
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>Universal Profile</div>
            <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{profile.name}</div>
          </div>
        </div>
      )}

      {address && (
        <div style={{ marginBottom: '20px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '0.75rem', wordBreak: 'break-all', textAlign: 'center' }}>
          <span style={{ color: '#888' }}>Address: </span>
          <span style={{ color: '#ff0055' }}>{address}</span>
        </div>
      )}

      {loading && (
        <div style={{ padding: '15px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', textAlign: 'center' }}>
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

      {!address && !loading && (
        <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#666' }}>Connecting to Universal Profile...</p>
        </div>
      )}
    </div>
  );
}

// VerifiableURI をデコードする関数
function decodeVerifiableURI(hex: string): { hashFunction: string; hash: string; url: string } {
  // VerifiableURI の構造:
  // 0x00006f357c6a = magic (keccak256(utf8))
  // 0020 = hash length (32 bytes)
  // [32 bytes hash]
  // [url as utf8 string]

  if (!hex || hex === '0x') {
    return { hashFunction: '', hash: '', url: '' };
  }

  const magic = hex.slice(0, 10); // 0x00006f357c6a
  const hashLength = parseInt(hex.slice(10, 14), 16) * 2; // 20 (32 bytes = 64 hex chars)
  const hash = '0x' + hex.slice(14, 14 + hashLength);
  const urlHex = hex.slice(14 + hashLength);

  // Hex to string
  let url = '';
  for (let i = 0; i < urlHex.length; i += 2) {
    url += String.fromCharCode(parseInt(urlHex.slice(i, i + 2), 16));
  }

  return {
    hashFunction: magic === '0x00006f357c6a' ? 'keccak256(utf8)' : 'unknown',
    hash,
    url,
  };
}

export default App;
