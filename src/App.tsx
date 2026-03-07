import { useState, useEffect } from 'react';
import { createClientUPProvider } from '@lukso/up-provider';
import { createPublicClient, http, parseAbi, defineChain } from 'viem';

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

const IPFS_GATEWAY = 'https://api.universalprofile.cloud/ipfs/';

// LSP3Profile のデータキー
const LSP3_KEY = '0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5' as const;

// LUKSO Mainnet のチェーン定義
const luksoMainnet = defineChain({
  id: 42,
  name: 'LUKSO Mainnet',
  nativeCurrency: {
    decimals: 18,
    name: 'LUKSO',
    symbol: 'LYX',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mainnet.lukso.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'LUKSO Explorer',
      url: 'https://explorer.execution.mainnet.lukso.network',
    },
  },
});

// UniversalProfile の ABI（getData 用）
const UP_ABI = parseAbi([
  'function getData(bytes32 key) external view returns (bytes memory value)',
]);

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

    console.log('[UP Birthday] Address:', upAddress);
    console.log('[UP Birthday] Accounts:', accounts);
    console.log('[UP Birthday] Context:', contextAccounts);

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
    console.log('[UP Birthday] Fetching profile for:', addr);
    try {
      // viem で LUKSO RPC に接続
      const client = createPublicClient({
        chain: luksoMainnet,
        transport: http(),
      });

      // getData を呼び出し
      const data = await client.readContract({
        address: addr as `0x${string}`,
        abi: UP_ABI,
        functionName: 'getData',
        args: [LSP3_KEY],
      });

      console.log('[UP Birthday] Raw data:', data);

      if (!data || data === '0x') {
        console.log('[UP Birthday] No LSP3Profile data');
        setProfile({ name: 'Unknown' });
        return;
      }

      // VerifiableURI をデコード
      const decoded = decodeVerifiableURI(data);
      console.log('[UP Birthday] Decoded URI:', decoded);

      if (!decoded.url) {
        setProfile({ name: 'Unknown' });
        return;
      }

      // IPFS URL をゲートウェイ URL に変換
      let jsonUrl = decoded.url;
      if (jsonUrl.startsWith('ipfs://')) {
        jsonUrl = IPFS_GATEWAY + jsonUrl.replace('ipfs://', '');
      }

      console.log('[UP Birthday] Fetching from:', jsonUrl);

      // プロフィール JSON を取得
      const profileRes = await fetch(jsonUrl);
      if (!profileRes.ok) {
        throw new Error(`Failed to fetch profile: ${profileRes.status}`);
      }
      const profileJson = await profileRes.json();
      console.log('[UP Birthday] Profile JSON:', profileJson);

      const lsp3Data = profileJson.LSP3Profile || profileJson;

      // プロフィール画像の URL を取得
      let avatarUrl: string | undefined;
      if (lsp3Data.profileImage && Array.isArray(lsp3Data.profileImage) && lsp3Data.profileImage.length > 0) {
        const img = lsp3Data.profileImage[0];
        if (img.url && typeof img.url === 'string') {
          if (img.url.startsWith('ipfs://')) {
            avatarUrl = IPFS_GATEWAY + img.url.replace('ipfs://', '');
          } else if (img.url.startsWith('https://') || img.url.startsWith('http://')) {
            avatarUrl = img.url;
          }
        }
      }

      console.log('[UP Birthday] Avatar URL:', avatarUrl);
      console.log('[UP Birthday] Name:', lsp3Data.name);

      setProfile({
        name: lsp3Data.name || 'Unknown',
        avatarUrl,
      });
    } catch (e) {
      console.error('[UP Birthday] Profile fetch error:', e);
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
  if (!hex || hex === '0x') {
    return { hashFunction: '', hash: '', url: '' };
  }

  // VerifiableURI の構造:
  // 0x00006f357c6a = magic (keccak256(utf8))
  // 0020 = hash length (32 bytes)
  // [32 bytes hash]
  // [url as utf8 string]

  const magic = hex.slice(0, 10);
  const hashLength = parseInt(hex.slice(10, 14), 16) * 2;
  const hash = '0x' + hex.slice(14, 14 + hashLength);
  const urlHex = hex.slice(14 + hashLength);

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
