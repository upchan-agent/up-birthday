import { useState, useEffect } from 'react';
import { createClientUPProvider } from '@lukso/up-provider';
import { request, gql } from 'graphql-request';

const GRAPHQL_ENDPOINT = 'https://envio.lukso-mainnet.universal.tech/v1/graphql';

const GET_PROFILE_QUERY = gql`
  query GetProfile($address: String!) {
    Profile(where: { id: { _eq: $address } }) {
      id
      name
      fullName
      profileImages(where: { error: { _is_null: true } }) {
        width
        url
      }
    }
  }
`;

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
  const [inputAddress, setInputAddress] = useState('');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [birthday, setBirthday] = useState<BirthdayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'grid' | 'manual' | 'url'>('manual');

  // URL パラメータからアドレスを取得
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const addrParam = params.get('address');
    if (addrParam && addrParam.startsWith('0x')) {
      setAddress(addrParam.toLowerCase() as `0x${string}`);
      setMode('url');
      fetchProfile(addrParam);
      fetchBirthday(addrParam);
    }
  }, []);

  // Grid 経由の接続を監視
  useEffect(() => {
    const provider = createClientUPProvider();

    const accounts = provider.accounts as string[];
    const contextAccounts = provider.contextAccounts as string[];

    const upAddress = contextAccounts.length > 0 ? contextAccounts[0] : accounts[0];

    if (upAddress && !address) {
      setAddress(upAddress);
      setMode('grid');
      fetchProfile(upAddress);
      fetchBirthday(upAddress);
    }

    const handleAccountsChanged = (newAccounts: string[]) => {
      if (newAccounts.length > 0 && !address) {
        setAddress(newAccounts[0]);
        setMode('grid');
        fetchProfile(newAccounts[0]);
        fetchBirthday(newAccounts[0]);
      }
    };

    const handleContextAccountsChanged = (newContextAccounts: string[]) => {
      if (newContextAccounts.length > 0 && !address) {
        setAddress(newContextAccounts[0]);
        setMode('grid');
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
  }, [address]);

  const fetchProfile = async (addr: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await request(GRAPHQL_ENDPOINT, GET_PROFILE_QUERY, { address: addr.toLowerCase() });
      const profileData = data.Profile?.[0];

      if (!profileData) {
        setProfile({ name: 'Unknown' });
        return;
      }

      // 画像の選択：最小サイズ（アイコン用）
      const images = profileData.profileImages || [];
      const avatarUrl = images.length > 0
        ? images.sort((a: any, b: any) => a.width - b.width)[0].url
        : undefined;

      setProfile({
        name: profileData.fullName || profileData.name || 'Unknown',
        avatarUrl,
      });
    } catch (e) {
      console.error('Profile fetch error:', e);
      setProfile({ name: 'Unknown' });
    } finally {
      setLoading(false);
    }
  };

  const fetchBirthday = async (addr: string) => {
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
    }
  };

  const handleManualCheck = () => {
    if (!inputAddress.startsWith('0x')) {
      setError('Please enter a valid LUKSO address (0x...)');
      return;
    }
    const addr = inputAddress.toLowerCase();
    setAddress(addr);
    setMode('manual');
    fetchProfile(addr);
    fetchBirthday(addr);
  };

  const handleReset = () => {
    setAddress(null);
    setInputAddress('');
    setProfile(null);
    setBirthday(null);
    setError(null);
    setMode('manual');
  };

  return (
    <div style={styles.container}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>
          <span style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>🆙</span> Birthday
        </h1>
        <p style={styles.subtitle}>
          {mode === 'grid' && '📱 Grid Mode'}
          {mode === 'manual' && '🔍 Manual Mode'}
          {mode === 'url' && '🔗 Shared Mode'}
        </p>
      </div>

      {/* アドレス入力フォーム（Grid/URL 以外） */}
      {!address && mode === 'manual' && (
        <div style={styles.inputSection}>
          <p style={styles.inputLabel}>Enter your LUKSO Universal Profile address</p>
          <div style={styles.inputGroup}>
            <input
              type="text"
              value={inputAddress}
              onChange={(e) => setInputAddress(e.target.value)}
              placeholder="0x5bA145ebB07e603328285A04589da2a7A202fCED"
              style={styles.input}
              onKeyDown={(e) => e.key === 'Enter' && handleManualCheck()}
            />
            <button onClick={handleManualCheck} style={styles.button}>
              Check
            </button>
          </div>
          <p style={styles.hint}>
            💡 Tip: Add <code style={styles.code}>?address=0x...</code> to the URL to share
          </p>
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div style={styles.loadingCard}>
          <div style={styles.loadingSpinner}>🎈</div>
          <p style={styles.loadingText}>Fetching your birthday...</p>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div style={styles.errorCard}>
          <span style={styles.errorIcon}>⚠️</span>
          <p style={styles.errorText}>{error}</p>
          <button onClick={handleReset} style={styles.resetButton}>
            Reset
          </button>
        </div>
      )}

      {/* プロフィール表示 */}
      {profile && address && (
        <div style={styles.profileCard}>
          <div style={styles.profileHeader}>
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                style={styles.avatar}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div style={styles.avatarPlaceholder}>
                {profile.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={styles.profileInfo}>
              <div style={styles.profileLabel}>Universal Profile</div>
              <div style={styles.profileName}>{profile.name}</div>
            </div>
          </div>

          <div style={styles.addressBox}>
            <span style={styles.addressLabel}>Address</span>
            <span style={styles.addressValue}>{address}</span>
          </div>

          <button onClick={handleReset} style={styles.resetButtonSmall}>
            🔍 Check Another
          </button>
        </div>
      )}

      {/* 誕生日情報 */}
      {birthday && (
        <div style={styles.birthdayCard}>
          <div style={styles.birthdayHeader}>
            <span style={styles.birthdayIcon}>🎂</span>
            <span style={styles.birthdayTitle}>Your UP Birthday</span>
          </div>

          <div style={styles.birthdayItem}>
            <span style={styles.birthdayLabel}>🎉 Created At (UTC)</span>
            <b style={styles.birthdayValue}>{birthday.utc}</b>
          </div>

          <div style={styles.birthdayItem}>
            <span style={styles.birthdayLabel}>🕐 Local Time</span>
            <b style={styles.birthdayValue}>{birthday.local}</b>
          </div>

          <div style={styles.birthdayItem}>
            <span style={styles.birthdayLabel}>📝 Creation Transaction</span>
            <a
              href={birthday.txUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.txLink}
            >
              {birthday.txHash.slice(0, 10)}...{birthday.txHash.slice(-8)}
            </a>
          </div>

          <div style={styles.footer}>
            <span style={styles.footerEmoji}>🆙</span>
            <span style={styles.footerText}>Built with ❤️ for LUKSO</span>
          </div>
        </div>
      )}

      {!address && !loading && mode !== 'manual' && (
        <div style={styles.connectingCard}>
          <p style={styles.connectingText}>Connecting to Universal Profile...</p>
        </div>
      )}
    </div>
  );
}

// 🆙ちゃんカラー：スタイリッシュ・ダークテーマ
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    padding: '24px 16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%)',
    color: '#ffffff',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '2.5rem',
    fontWeight: '800',
    background: 'linear-gradient(135deg, #ff0055 0%, #ff6b9d 50%, #ff0055 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#8888aa',
    fontWeight: '500',
  },
  inputSection: {
    maxWidth: '500px',
    margin: '0 auto 32px',
    padding: '24px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '20px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  inputLabel: {
    margin: '0 0 16px 0',
    fontSize: '0.95rem',
    color: '#aaaacc',
    textAlign: 'center',
  },
  inputGroup: {
    display: 'flex',
    gap: '12px',
  },
  input: {
    flex: 1,
    padding: '14px 18px',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    color: '#ffffff',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  button: {
    padding: '14px 28px',
    fontSize: '0.95rem',
    fontWeight: '700',
    background: 'linear-gradient(135deg, #ff0055 0%, #ff6b9d 100%)',
    border: 'none',
    borderRadius: '12px',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    whiteSpace: 'nowrap',
  },
  hint: {
    margin: '16px 0 0 0',
    fontSize: '0.8rem',
    color: '#666688',
    textAlign: 'center',
  },
  code: {
    background: 'rgba(255, 255, 255, 0.1)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '0.75rem',
  },
  loadingCard: {
    maxWidth: '500px',
    margin: '0 auto',
    padding: '40px 24px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '20px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    textAlign: 'center',
  },
  loadingSpinner: {
    fontSize: '3rem',
    marginBottom: '16px',
    animation: 'bounce 1s infinite',
  },
  loadingText: {
    margin: 0,
    color: '#aaaacc',
    fontSize: '1rem',
  },
  errorCard: {
    maxWidth: '500px',
    margin: '0 auto',
    padding: '20px 24px',
    background: 'rgba(255, 0, 85, 0.1)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 0, 85, 0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  errorIcon: {
    fontSize: '1.5rem',
  },
  errorText: {
    margin: 0,
    flex: 1,
    color: '#ff6b9d',
    fontSize: '0.95rem',
  },
  resetButton: {
    padding: '10px 20px',
    fontSize: '0.85rem',
    fontWeight: '600',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '10px',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  profileCard: {
    maxWidth: '500px',
    margin: '0 auto 24px',
    padding: '24px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '20px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  profileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '20px',
  },
  avatar: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '3px solid rgba(255, 0, 85, 0.3)',
  },
  avatarPlaceholder: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #ff0055 0%, #ff6b9d 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.8rem',
    fontWeight: 'bold',
    color: '#ffffff',
    border: '3px solid rgba(255, 255, 255, 0.2)',
  },
  profileInfo: {
    flex: 1,
  },
  profileLabel: {
    fontSize: '0.75rem',
    color: '#8888aa',
    marginBottom: '4px',
  },
  profileName: {
    fontSize: '1.3rem',
    fontWeight: '700',
    color: '#ffffff',
  },
  addressBox: {
    padding: '14px 18px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    marginBottom: '16px',
  },
  addressLabel: {
    display: 'block',
    fontSize: '0.7rem',
    color: '#666688',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  addressValue: {
    display: 'block',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    color: '#ff6b9d',
    wordBreak: 'break-all',
  },
  resetButtonSmall: {
    width: '100%',
    padding: '12px',
    fontSize: '0.9rem',
    fontWeight: '600',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    color: '#aaaacc',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  birthdayCard: {
    maxWidth: '500px',
    margin: '0 auto',
    padding: '28px 24px',
    background: 'linear-gradient(135deg, rgba(255, 0, 85, 0.08) 0%, rgba(255, 107, 157, 0.05) 100%)',
    borderRadius: '20px',
    border: '1px solid rgba(255, 0, 85, 0.2)',
  },
  birthdayHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginBottom: '24px',
  },
  birthdayIcon: {
    fontSize: '2rem',
  },
  birthdayTitle: {
    fontSize: '1.4rem',
    fontWeight: '700',
    color: '#ffffff',
  },
  birthdayItem: {
    padding: '16px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  birthdayLabel: {
    display: 'block',
    fontSize: '0.8rem',
    color: '#8888aa',
    marginBottom: '8px',
  },
  birthdayValue: {
    display: 'block',
    fontSize: '1rem',
    color: '#ffffff',
    fontWeight: '500',
  },
  txLink: {
    display: 'block',
    fontSize: '0.85rem',
    color: '#ff6b9d',
    textDecoration: 'none',
    fontFamily: 'monospace',
    transition: 'color 0.2s',
  },
  footer: {
    marginTop: '24px',
    paddingTop: '20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  footerEmoji: {
    fontSize: '1.2rem',
  },
  footerText: {
    fontSize: '0.85rem',
    color: '#666688',
  },
  connectingCard: {
    maxWidth: '500px',
    margin: '0 auto',
    padding: '40px 24px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '20px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    textAlign: 'center',
  },
  connectingText: {
    margin: 0,
    color: '#aaaacc',
    fontSize: '1rem',
  },
};

export default App;
