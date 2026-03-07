import { useState, useEffect, useCallback } from 'react';
import { createClientUPProvider } from '@lukso/up-provider';
import { createPublicClient, http, parseAbi, defineChain } from 'viem';

const IPFS_GATEWAY = 'https://api.universalprofile.cloud/ipfs/';
const LSP3_KEY = '0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5' as const;

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
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [providerReady, setProviderReady] = useState(false);

  const log = useCallback((msg: string, data?: any) => {
    const logMsg = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log('[UP Birthday]', msg, data || '');
    setDebugInfo(prev => [...prev.slice(-9), logMsg + (data ? `: ${JSON.stringify(data).slice(0, 50)}` : '')]);
  }, []);

  const fetchProfile = useCallback(async (addr: string) => {
    log('Fetching profile for:', addr);
    try {
      const client = createPublicClient({
        chain: luksoMainnet,
        transport: http(),
      });

      const data = await client.readContract({
        address: addr as `0x${string}`,
        abi: parseAbi(['function getData(bytes32 key) external view returns (bytes memory value)']),
        functionName: 'getData',
        args: [LSP3_KEY],
      });

      log('Raw data length:', data?.length);

      if (!data || data === '0x') {
        log('No LSP3Profile data');
        setProfile({ name: 'Unknown' });
        return;
      }

      const decoded = decodeVerifiableURI(data);
      log('Decoded URL:', decoded.url);

      if (!decoded.url) {
        setProfile({ name: 'Unknown' });
        return;
      }

      let jsonUrl = decoded.url;
      if (jsonUrl.startsWith('ipfs://')) {
        jsonUrl = IPFS_GATEWAY + jsonUrl.replace('ipfs://', '');
      }

      log('Fetching from:', jsonUrl);

      const profileRes = await fetch(jsonUrl);
      if (!profileRes.ok) {
        throw new Error(`Failed to fetch: ${profileRes.status}`);
      }
      const profileJson = await profileRes.json();
      log('Profile JSON keys:', Object.keys(profileJson));

      const lsp3Data = profileJson.LSP3Profile || profileJson;

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

      log('Name:', lsp3Data.name);
      log('Avatar URL:', avatarUrl);

      setProfile({
        name: lsp3Data.name || 'Unknown',
        avatarUrl,
      });
    } catch (e) {
      log('Profile fetch error:', e);
      setProfile({ name: 'Unknown' });
    }
  }, [log]);

  const fetchBirthday = useCallback(async (addr: string) => {
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
  }, []);

  useEffect(() => {
    log('=== App mounted ===');

    // Provider 初期化を遅延させる
    const initProvider = async () => {
      log('Creating provider...');
      
      // 少し待ってから初期化（Grid からのメッセージを待つ）
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const provider = createClientUPProvider();
      
      log('Provider created');
      log('Provider type:', typeof provider);
      log('Provider accounts:', provider.accounts);
      log('Provider contextAccounts:', provider.contextAccounts);

      // アドレスを取得
      const accounts = provider.accounts as string[];
      const contextAccounts = provider.contextAccounts as string[];

      log('Accounts array:', accounts);
      log('Context array:', contextAccounts);
      log('Accounts length:', accounts?.length);
      log('Context length:', contextAccounts?.length);

      const upAddress = contextAccounts.length > 0 ? contextAccounts[0] : accounts[0];

      log('Selected address:', upAddress);

      if (upAddress) {
        setAddress(upAddress);
        fetchProfile(upAddress);
        fetchBirthday(upAddress);
      } else {
        log('⚠️ No address available!');
        log('Checking if in iframe...');
        log('window === window.parent:', window === window.parent);
        log('window.location.ancestorOrigins:', Array.from(window.location.ancestorOrigins || []));
      }

      // イベントリスナー
      const handleAccountsChanged = (newAccounts: string[]) => {
        log('accountsChanged:', newAccounts);
        if (newAccounts.length > 0) {
          setAddress(newAccounts[0]);
          fetchProfile(newAccounts[0]);
          fetchBirthday(newAccounts[0]);
        }
      };

      const handleContextAccountsChanged = (newContextAccounts: string[]) => {
        log('contextAccountsChanged:', newContextAccounts);
        if (newContextAccounts.length > 0) {
          setAddress(newContextAccounts[0]);
          fetchProfile(newContextAccounts[0]);
          fetchBirthday(newContextAccounts[0]);
        }
      };

      provider.on('accountsChanged', handleAccountsChanged);
      provider.on('contextAccountsChanged', handleContextAccountsChanged);

      setProviderReady(true);
      log('Provider ready!');

      // クリーンアップ
      return () => {
        log('Cleaning up event listeners...');
        provider.removeListener('accountsChanged', handleAccountsChanged);
        provider.removeListener('contextAccountsChanged', handleContextAccountsChanged);
      };
    };

    const cleanup = initProvider();

    return () => {
      cleanup.then(fn => fn?.());
    };
  }, [fetchProfile, fetchBirthday, log]);

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '16px', textAlign: 'center' }}>
        <span style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>🎂</span> UP Birthday
      </h2>

      {/* デバッグ情報 */}
      <div style={{ marginBottom: '20px', padding: '10px', background: 'rgba(255,0,85,0.1)', borderRadius: '8px', fontSize: '0.65rem', fontFamily: 'monospace', maxHeight: '300px', overflowY: 'auto' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Debug Log:</div>
        <div style={{ color: providerReady ? '#4ade80' : '#fbbf24' }}>
          Provider Ready: {providerReady ? '✅ Yes' : '⏳ Loading...'}
        </div>
        <div style={{ color: address ? '#4ade80' : '#ef4444' }}>
          Address: {address || '❌ Not set'}
        </div>
        <hr style={{ margin: '8px 0', borderColor: 'rgba(255,255,255,0.2)' }} />
        {debugInfo.map((line, i) => (
          <div key={i} style={{ marginBottom: '2px' }}>{line}</div>
        ))}
      </div>

      {profile && (
        <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', background: '#333' }}
              onError={(e) => {
                log('Image load error');
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

function decodeVerifiableURI(hex: string): { hashFunction: string; hash: string; url: string } {
  if (!hex || hex === '0x') {
    return { hashFunction: '', hash: '', url: '' };
  }

  // VerifiableURI 構造:
  // 0x (プレフィックス)
  // 0000 (verificationMethod: 0 = keccak256)
  // 6f357c6a (hashFunction: 4 bytes)
  // 0020 (hashLength: 32 bytes = 64 hex chars)
  // [64 hex chars hash]
  // [url as UTF-8 hex]

  // ヘッダー: 0x + 0000 + 6f357c6a + 0020 = 10 + 8 = 18 chars (0x 含む)
  // 実際には: 0x00006f357c6a0020 = 18 chars
  
  if (hex.length < 18) {
    console.error('VerifiableURI too short:', hex);
    return { hashFunction: '', hash: '', url: '' };
  }

  const verificationMethod = hex.slice(2, 6); // 0000
  const hashFunctionHex = hex.slice(6, 14); // 6f357c6a
  const hashLengthHex = hex.slice(14, 18); // 0020
  
  const hashLength = parseInt(hashLengthHex, 16) * 2; // 32 * 2 = 64
  const hash = '0x' + hex.slice(18, 18 + hashLength);
  const urlHex = hex.slice(18 + hashLength);

  console.log('Verification method:', verificationMethod);
  console.log('Hash function:', hashFunctionHex);
  console.log('Hash length:', hashLength);
  console.log('Hash:', hash);
  console.log('URL hex length:', urlHex.length);
  console.log('URL hex (first 100):', urlHex.slice(0, 100));

  let url = '';
  for (let i = 0; i < urlHex.length; i += 2) {
    const code = parseInt(urlHex.slice(i, i + 2), 16);
    if (code > 0) { // .null 文字をスキップ
      url += String.fromCharCode(code);
    }
  }

  console.log('Decoded URL:', url);

  return {
    hashFunction: hashFunctionHex === '6f357c6a' ? 'keccak256(utf8)' : 'unknown',
    hash,
    url,
  };
}

export default App;
