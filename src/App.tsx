import { useState, useEffect } from 'react';
import { createClientUPProvider } from '@lukso/up-provider';
import { request } from 'graphql-request';

const GRAPHQL_ENDPOINT = 'https://envio.lukso-mainnet.universal.tech/v1/graphql';

const GET_PROFILE_QUERY = `
  query GetProfile($address: String!) {
    Profile(where: { id: { _eq: $address } }) {
      id
      name
      fullName
      profileImages(where: { error: { _is_null: true } }) {
        width
        height
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

  // URL パラメータからアドレスを取得
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const addrParam = params.get('address');
    if (addrParam && addrParam.startsWith('0x')) {
      setInputAddress(addrParam);
      setAddress(addrParam.toLowerCase() as `0x${string}`);
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
      setInputAddress(upAddress);
      setAddress(upAddress);
      fetchProfile(upAddress);
      fetchBirthday(upAddress);
    }

    const handleAccountsChanged = (newAccounts: string[]) => {
      if (newAccounts.length > 0 && !address) {
        setInputAddress(newAccounts[0]);
        setAddress(newAccounts[0]);
        fetchProfile(newAccounts[0]);
        fetchBirthday(newAccounts[0]);
      }
    };

    const handleContextAccountsChanged = (newContextAccounts: string[]) => {
      if (newContextAccounts.length > 0 && !address) {
        setInputAddress(newContextAccounts[0]);
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
      let avatarUrl: string | undefined;
      
      if (images.length > 0) {
        const sorted = [...images].sort((a, b) => (a.width || 0) - (b.width || 0));
        const rawUrl = sorted[0].url;
        
        // IPFS URL をゲートウェイ URL に変換
        if (rawUrl?.startsWith('ipfs://')) {
          avatarUrl = 'https://api.universalprofile.cloud/ipfs/' + rawUrl.replace('ipfs://', '');
        } else if (rawUrl?.startsWith('https://') || rawUrl?.startsWith('http://')) {
          avatarUrl = rawUrl;
        } else {
          avatarUrl = rawUrl;
        }
      }

      setProfile({
        name: profileData.fullName || profileData.name || 'Unknown',
        avatarUrl,
      });
    } catch (e: any) {
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
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    }
  };

  const handleCheck = () => {
    if (!inputAddress.startsWith('0x')) {
      setError('Please enter a valid LUKSO address (0x...)');
      return;
    }
    const addr = inputAddress.toLowerCase();
    setAddress(addr);
    fetchProfile(addr);
    fetchBirthday(addr);
  };

  const handleReset = () => {
    setAddress(null);
    setInputAddress('');
    setProfile(null);
    setBirthday(null);
    setError(null);
  };

  return (
    <div style={styles.container}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.titleWrapper}>
          <span style={styles.emoji}>🆙</span>
          <span style={styles.titleText}>Birthday</span>
          <span style={styles.emoji}>🎂</span>
        </h1>
        <p style={styles.subtitle}>
          Discover when your Universal Profile was born
        </p>
      </div>

      {/* アドレス入力フォーム（常に表示） */}
      <div style={styles.inputSection}>
        <p style={styles.inputLabel}>
          Auto-detected via Grid or enter manually
        </p>
        <div style={styles.inputGroup}>
          <input
            type="text"
            value={inputAddress}
            onChange={(e) => setInputAddress(e.target.value)}
            placeholder="0xbcA4eEBea76926c49C64AB86A527CC833eFa3B2D"
            style={styles.input}
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
          />
          <button onClick={handleCheck} style={styles.button}>
            Check
          </button>
        </div>
      </div>

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
              <div style={styles.profileName}>{profile.name}</div>
            </div>
          </div>

          <button onClick={handleReset} style={styles.resetButtonSmall}>
            Clear
          </button>
        </div>
      )}

      {/* 誕生日情報 */}
      {birthday && (
        <div style={styles.birthdayCard}>
          <div style={styles.birthdayHeader}>
            <p style={styles.birthdaySubtitle}>
              <span style={styles.birthdayCake}>🎂</span> Your Universal Profile was born on ✨
            </p>
          </div>

          <div style={styles.birthdayItem}>
            <span style={styles.birthdayLabel}>🎉 UTC</span>
            <b style={styles.birthdayValue}>{birthday.utc}</b>
          </div>

          <div style={styles.birthdayItem}>
            <span style={styles.birthdayLabel}>🕐 Local</span>
            <b style={styles.birthdayValue}>{birthday.local}</b>
          </div>

          <div style={styles.birthdayItem}>
            <span style={styles.birthdayLabel}>📝 Transaction</span>
            <a
              href={birthday.txUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.txLink}
            >
              {birthday.txHash.slice(0, 10)}...{birthday.txHash.slice(-8)}
            </a>
          </div>
        </div>
      )}

      {/* フッター（常に表示） */}
      <div style={styles.footerContainer}>
        <div style={styles.footer}>
          <span style={styles.footerText}>Made with </span>
          <span style={styles.footerHeart}>❤️</span>
          <span style={styles.footerText}> by </span>
          <a href="https://profile.link/🆙chan@bcA4" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
            <span style={styles.footerEmoji}>🆙</span>chan
          </a>
          <span style={styles.footerSeparator}>|</span>
          <a href="https://x.com/UPchan_lyx" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
            <span style={styles.footerX}>𝕏</span>
          </a>
        </div>
      </div>
    </div>
  );
}

// 🆙ちゃんカラー：明るくポップなデザイン
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    width: '100%',
    padding: '32px 16px',
    fontFamily: 'inherit',
    background: '#fce8ed',
    color: '#333344',
    overflowX: 'hidden',
    boxSizing: 'border-box',
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px',
  },
  titleWrapper: {
    margin: '0 0 12px 0',
    fontSize: 'clamp(2rem, 6vw, 3rem)',
    fontWeight: '800',
    letterSpacing: '-0.03em',
    display: 'inline-block',
  },
  emoji: {
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
    fontVariantEmoji: 'emoji',
    margin: '0 10px',
  },
  titleText: {
    background: 'linear-gradient(135deg, #ff6b9d 0%, #ff0055 50%, #ff6b9d 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  subtitle: {
    margin: 0,
    fontSize: '1rem',
    color: '#886677',
    fontWeight: '500',
  },
  inputSection: {
    maxWidth: '520px',
    margin: '0 auto 24px',
    padding: '32px',
    background: '#fce8ed',
    borderRadius: '24px',
    border: '2px solid #f9aec7',
    boxShadow: '0 4px 16px rgba(249, 174, 199, 0.2)',
    width: '100%',
    boxSizing: 'border-box',
  },
  inputLabel: {
    margin: '0 0 16px 0',
    fontSize: '0.85rem',
    color: '#886677',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 1.5,
  },
  inputGroup: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  input: {
    flex: '1 1 240px',
    minWidth: '240px',
    padding: '16px 20px',
    fontSize: '0.95rem',
    fontFamily: '"Quicksand", "Nunito", monospace',
    background: '#ffffff',
    border: '2px solid #f9aec7',
    borderRadius: '14px',
    color: '#333344',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  },
  button: {
    padding: '16px 32px',
    fontSize: '1rem',
    fontWeight: '700',
    background: '#f9aec7',
    border: 'none',
    borderRadius: '14px',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    boxShadow: '0 4px 16px rgba(249, 174, 199, 0.25)',
  },
  loadingCard: {
    maxWidth: '500px',
    margin: '0 auto 24px',
    padding: '48px 24px',
    background: '#fce8ed',
    borderRadius: '24px',
    border: '2px solid #f9aec7',
    textAlign: 'center',
  },
  loadingSpinner: {
    fontSize: '3.5rem',
    marginBottom: '16px',
    animation: 'bounce 1s infinite',
  },
  loadingText: {
    margin: 0,
    color: '#886677',
    fontSize: '1.05rem',
  },
  errorCard: {
    maxWidth: '500px',
    margin: '0 auto 24px',
    padding: '24px 28px',
    background: '#fce8ed',
    borderRadius: '20px',
    border: '2px solid #f9aec7',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    flexWrap: 'wrap',
  },
  errorIcon: {
    fontSize: '1.6rem',
  },
  errorText: {
    margin: 0,
    flex: '1 1 auto',
    color: '#ff0055',
    fontSize: '0.95rem',
    minWidth: '200px',
  },
  resetButton: {
    padding: '12px 24px',
    fontSize: '0.9rem',
    fontWeight: '600',
    background: 'rgba(255, 107, 157, 0.15)',
    border: '2px solid rgba(255, 107, 157, 0.3)',
    borderRadius: '12px',
    color: '#ff0055',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  profileCard: {
    maxWidth: '520px',
    margin: '0 auto 24px',
    padding: '28px',
    background: '#fce8ed',
    borderRadius: '24px',
    border: '2px solid #f9aec7',
    boxShadow: '0 4px 16px rgba(249, 174, 199, 0.2)',
    width: '100%',
    boxSizing: 'border-box',
  },
  profileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '20px',
    justifyContent: 'center',
  },
  avatar: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  },
  avatarPlaceholder: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #ff6b9d 0%, #ff0055 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2rem',
    fontWeight: 'bold',
    color: '#ffffff',
    flexShrink: 0,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
  },
  profileName: {
    fontSize: '1.4rem',
    fontWeight: '700',
    color: '#886677',
    wordBreak: 'break-word',
    marginBottom: '6px',
  },
  addressValue: {
    fontSize: '0.75rem',
    fontFamily: '"Quicksand", "Nunito", monospace',
    color: '#886677',
    wordBreak: 'break-all',
  },
  resetButtonSmall: {
    width: '100%',
    padding: '16px 32px',
    fontSize: '1rem',
    fontWeight: '700',
    background: '#f9aec7',
    border: 'none',
    borderRadius: '14px',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    boxShadow: '0 4px 16px rgba(249, 174, 199, 0.25)',
  },
  birthdayCard: {
    maxWidth: '520px',
    margin: '0 auto',
    padding: '32px 28px',
    background: '#fce8ed',
    borderRadius: '24px',
    border: '2px solid #f9aec7',
    boxShadow: '0 4px 16px rgba(249, 174, 199, 0.2)',
    width: '100%',
    boxSizing: 'border-box',
  },
  birthdayHeader: {
    textAlign: 'center',
    marginBottom: '28px',
  },
  birthdayCake: {
    fontSize: '1.4rem',
  },
  birthdaySubtitle: {
    margin: 0,
    fontSize: '1.1rem',
    color: '#886677',
    fontWeight: '600',
  },
  birthdayItem: {
    padding: '18px 0',
    borderBottom: '2px dashed #f9aec7',
    textAlign: 'center',
  },
  birthdayLabel: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#886677',
    marginBottom: '8px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  birthdayValue: {
    display: 'block',
    fontSize: '0.95rem',
    color: '#886677',
    fontWeight: '600',
    wordBreak: 'break-word',
  },
  txLink: {
    display: 'block',
    fontSize: '0.8rem',
    color: '#ff6b9d',
    textDecoration: 'none',
    fontFamily: '"Quicksand", "Nunito", monospace',
    transition: 'color 0.2s',
    fontWeight: '600',
  },
  footerContainer: {
    marginTop: '48px',
    paddingTop: '28px',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  footerText: {
    fontSize: '0.85rem',
    color: '#997788',
  },
  footerHeart: {
    fontSize: '0.95rem',
  },
  footerEmoji: {
    fontSize: '1.1rem',
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
    fontVariantEmoji: 'emoji',
  },
  footerLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: '#ff6b9d',
    textDecoration: 'none',
    fontSize: '0.85rem',
    fontWeight: '600',
    transition: 'opacity 0.2s',
  },
  footerSeparator: {
    color: '#ddaacc',
    fontSize: '0.85rem',
  },
  footerX: {
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    color: '#665566',
  },
};

export default App;
