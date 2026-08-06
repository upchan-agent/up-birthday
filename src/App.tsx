import { useState, useEffect, useRef } from 'react';
import { createClientUPProvider } from '@lukso/up-provider';
import { request } from 'graphql-request';

const GRAPHQL_ENDPOINT = 'https://envio.lukso-mainnet.universal.tech/v1/graphql';

// profile + createdTimestamp を1クエリで取得（Envio は作成タイムスタンプをブロック時刻と一致して保持）
const GET_PROFILE_QUERY = `
  query GetProfile($address: String!) {
    Profile(where: { id: { _eq: $address } }) {
      id
      name
      fullName
      createdTimestamp
      profileImages(where: { error: { _is_null: true } }) {
        width
        height
        url
      }
    }
  }
`;

const EXPLORER_API = 'https://explorer.execution.mainnet.lukso.network/api/v2';

interface ProfileData {
  name: string;
  avatarUrl?: string;
}

interface EnvioProfile {
  id: string;
  name: string | null;
  fullName: string | null;
  createdTimestamp: number | null;
  profileImages: { width: number | null; height: number | null; url: string | null }[] | null;
}

interface BirthdayData {
  utc: string;
  local: string;
  txHash: string;
  txUrl: string;
  age: {
    years: number;
    months: number;
    days: number;
    elapsedDays: number;
  };
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

function App() {
  const [address, setAddress] = useState<string | null>(null);
  const [inputAddress, setInputAddress] = useState('');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [birthday, setBirthday] = useState<BirthdayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);

  // Grid の accountsChanged は購読を1回だけにして、ハンドラ内では ref で最新アドレスを参照する
  const addressRef = useRef<string | null>(null);
  addressRef.current = address;

  // Calculate age from birth date
  function calculateAge(birthDate: Date) {
    const now = new Date();
    const birth = birthDate;

    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    let days = now.getDate() - birth.getDate();

    if (days < 0) {
      months--;
      days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    const elapsedDays = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));

    return { years, months, days, elapsedDays };
  }

  // profile(Envio) と birthday(explorer creation tx) を並列で取得し、loading を一括管理
  const lookup = async (rawAddr: string) => {
    const addr = rawAddr.toLowerCase();
    setLoading(true);
    setError(null);
    setAvatarBroken(false);

    let profileResult: ProfileData = { name: 'Unknown' };
    let createdTs: number | null = null;

    try {
      const data = await request<{ Profile: EnvioProfile[] | null }>(
        GRAPHQL_ENDPOINT,
        GET_PROFILE_QUERY,
        { address: addr }
      );
      const profileData = data.Profile?.[0];

      if (profileData) {
        // 画像の選択：最小サイズ（アイコン用）
        const images = profileData.profileImages || [];
        let avatarUrl: string | undefined;

        if (images.length > 0) {
          const sorted = [...images].sort((a, b) => (a.width || 0) - (b.width || 0));
          const rawUrl = sorted[0].url;

          // IPFS URL をゲートウェイ URL に変換
          if (rawUrl?.startsWith('ipfs://')) {
            avatarUrl = 'https://api.universalprofile.cloud/ipfs/' + rawUrl.replace('ipfs://', '');
          } else {
            avatarUrl = rawUrl ?? undefined;
          }
        }

        profileResult = {
          name: profileData.fullName || profileData.name || 'Unknown',
          avatarUrl,
        };
        createdTs = profileData.createdTimestamp ?? null;
      }
    } catch (e) {
      console.error('Profile fetch error:', e);
    }
    setProfile(profileResult);

    try {
      // creation tx hash は explorer が権威ソース（Envio の transactions は作成 tx を保証しない）
      const addrRes = await fetch(`${EXPLORER_API}/addresses/${addr}`);
      const addrData = await addrRes.json();

      const txHash = addrData.creation_transaction_hash;
      if (!txHash) {
        throw new Error('Not found the creation transaction');
      }

      // タイムスタンプは Envio の createdTimestamp を優先（秒単位で explorer と一致を検証済み）。
      // Envio にレコードが無い場合のみ explorer の tx 詳細へフォールバック。
      let createdAt: Date;
      if (createdTs != null) {
        createdAt = new Date(createdTs * 1000);
      } else {
        const txRes = await fetch(`${EXPLORER_API}/transactions/${txHash}`);
        const txData = await txRes.json();
        createdAt = new Date(txData.timestamp);
      }

      setBirthday({
        utc: createdAt.toUTCString(),
        local: createdAt.toLocaleString(),
        txHash,
        txUrl: `https://explorer.execution.mainnet.lukso.network/tx/${txHash}`,
        age: calculateAge(createdAt),
      });
    } catch (e: unknown) {
      setBirthday(null);
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // URL パラメータからアドレスを取得
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const addrParam = params.get('address');
    if (addrParam && ADDRESS_PATTERN.test(addrParam)) {
      setInputAddress(addrParam);
      setAddress(addrParam.toLowerCase() as `0x${string}`);
      lookup(addrParam);
    }
  }, []);

  // Grid 経由の接続・UP 切替を監視（初回は未設定のみ採用、以降は切替に追従）
  useEffect(() => {
    const provider = createClientUPProvider();

    const adopt = (addr: string) => {
      const current = addressRef.current;
      if (current && addr.toLowerCase() === current.toLowerCase()) return;
      setAddress(addr);
      // 手動入力中のテキストは上書きしない（空欄または前の自動入力値のときだけ同期）
      setInputAddress((prev) =>
        prev === '' || (current && prev.toLowerCase() === current.toLowerCase()) ? addr : prev
      );
      lookup(addr);
    };

    const initialUp = provider.contextAccounts?.[0] ?? provider.accounts?.[0];
    if (initialUp && !addressRef.current) {
      adopt(initialUp);
    }

    const handleAccountsChanged = (newAccounts: string[]) => {
      if (newAccounts.length > 0) adopt(newAccounts[0]);
    };

    const handleContextAccountsChanged = (newContextAccounts: string[]) => {
      if (newContextAccounts.length > 0) adopt(newContextAccounts[0]);
    };

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('contextAccountsChanged', handleContextAccountsChanged);

    return () => {
      provider.removeListener('accountsChanged', handleAccountsChanged);
      provider.removeListener('contextAccountsChanged', handleContextAccountsChanged);
    };
  }, []);

  const handleCheck = () => {
    const addr = inputAddress.trim();
    if (!ADDRESS_PATTERN.test(addr)) {
      setError('Please enter a valid LUKSO address (0x + 40 hex characters)');
      return;
    }
    setAddress(addr.toLowerCase());
    lookup(addr);
  };

  const handleReset = () => {
    setAddress(null);
    setInputAddress('');
    setProfile(null);
    setBirthday(null);
    setError(null);
    setAvatarBroken(false);
  };

  const handleShare = () => {
    const url = `${window.location.origin}/?address=${address}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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

      {/* プロフィールと誕生日情報（1 つのカードに統合） */}
      {profile && birthday && !loading && (
        <div style={styles.resultCard}>
          <div style={styles.profileHeader}>
            {profile.avatarUrl && !avatarBroken ? (
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                style={styles.avatar}
                onError={() => setAvatarBroken(true)}
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

          <div style={styles.birthdayDivider}></div>

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
            <span style={styles.birthdayLabel}>🎂 Age</span>
            <b style={styles.birthdayValue}>
              {birthday.age.years} Y {birthday.age.months} M {birthday.age.days} D ( {birthday.age.elapsedDays} days )
            </b>
          </div>

          <div style={styles.birthdayItem}>
            <span style={styles.birthdayLabel}>📝 Transaction</span>
            <a
              href={birthday.txUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.txLink}
              title={birthday.txHash}
            >
              {birthday.txHash.slice(0, 10)}…{birthday.txHash.slice(-8)}
            </a>
          </div>

          <div style={styles.shareSection}>
            <button onClick={handleShare} style={styles.shareButton}>
              🔗 Share
            </button>
          </div>
        </div>
      )}

      {/* トースト表示 */}
      {copied && (
        <div style={styles.toast}>
          <span style={styles.toastIcon}>✅</span>
          <span>Link copied!</span>
        </div>
      )}

      {/* フッターを下端に押し出すスペーサー（旧版の marginTop:32px と同等の最低余白を確保） */}
      <div style={styles.footerSpacer} aria-hidden="true"></div>

      {/* フッター（常に画面下端に固定） */}
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
    minHeight: '100dvh',
    width: '100%',
    padding: '32px 16px 24px',
    fontFamily: 'inherit',
    background: '#fce8ed',
    color: '#333344',
    overflowX: 'hidden',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
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
    maxWidth: '480px',
    margin: '0 auto 20px',
    padding: '24px 28px',
    background: '#ffffff',
    borderRadius: '20px',
    boxShadow: '0 2px 12px rgba(249, 174, 199, 0.15)',
    width: '100%',
    boxSizing: 'border-box',
  },
  inputLabel: {
    margin: '0 0 14px 0',
    fontSize: '0.8rem',
    color: '#886677',
    textAlign: 'center',
    fontWeight: '500',
  },
  inputGroup: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  input: {
    flex: '1 1 200px',
    minWidth: '200px',
    padding: '12px 16px',
    fontSize: '0.9rem',
    fontFamily: '"Quicksand", "Nunito", monospace',
    background: '#faf5f7',
    border: 'none',
    borderRadius: '12px',
    color: '#333344',
    outline: 'none',
    boxSizing: 'border-box',
  },
  button: {
    padding: '12px 24px',
    fontSize: '0.9rem',
    fontWeight: '700',
    background: 'linear-gradient(135deg, #f9aec7 0%, #f78fb3 100%)',
    border: 'none',
    borderRadius: '12px',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'transform 0.2s, opacity 0.2s',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  loadingCard: {
    maxWidth: '480px',
    margin: '0 auto 20px',
    padding: '32px 24px',
    background: '#ffffff',
    borderRadius: '20px',
    boxShadow: '0 2px 12px rgba(249, 174, 199, 0.15)',
    textAlign: 'center',
    width: '100%',
    boxSizing: 'border-box',
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
    maxWidth: '480px',
    margin: '0 auto 20px',
    padding: '18px 24px',
    background: '#fff5f8',
    borderRadius: '16px',
    boxShadow: '0 2px 12px rgba(249, 174, 199, 0.15)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    width: '100%',
    boxSizing: 'border-box',
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
    padding: '8px 16px',
    fontSize: '0.8rem',
    fontWeight: '700',
    background: '#ffffff',
    border: '1px solid #f78fb3',
    borderRadius: '10px',
    color: '#f78fb3',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  resultCard: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '24px 28px',
    background: '#ffffff',
    borderRadius: '20px',
    boxShadow: '0 2px 12px rgba(249, 174, 199, 0.15)',
    width: '100%',
    boxSizing: 'border-box',
  },
  profileHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
  },
  birthdayDivider: {
    height: '1px',
    background: 'linear-gradient(90deg, transparent 0%, #f7b3c7 50%, transparent 100%)',
    margin: '16px 0',
  },
  avatar: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  },
  avatarPlaceholder: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #f9aec7 0%, #f78fb3 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
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
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#886677',
    wordBreak: 'break-word',
  },
  birthdayHeader: {
    textAlign: 'center',
    marginBottom: '16px',
  },
  birthdayCake: {
    fontSize: '1.3rem',
  },
  birthdaySubtitle: {
    margin: 0,
    fontSize: '1rem',
    color: '#886677',
    fontWeight: '600',
  },
  birthdayItem: {
    padding: '14px 0',
    borderBottom: '1px dashed #f7b3c7',
    textAlign: 'center',
  },
  shareSection: {
    textAlign: 'center',
    marginTop: '20px',
    paddingTop: '20px',
  },
  shareButton: {
    padding: '10px 20px',
    fontSize: '0.85rem',
    fontWeight: '600',
    background: 'linear-gradient(135deg, #f9aec7 0%, #f78fb3 100%)',
    border: 'none',
    borderRadius: '12px',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'transform 0.2s, opacity 0.2s',
  },
  toast: {
    position: 'fixed',
    bottom: 'calc(24px + env(safe-area-inset-bottom))',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '14px 28px',
    background: '#ffffff',
    border: '2px solid #f9aec7',
    borderRadius: '16px',
    fontSize: '0.9rem',
    color: '#886677',
    fontWeight: '600',
    boxShadow: '0 4px 20px rgba(249, 174, 199, 0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 1000,
    animation: 'fadeIn 0.2s ease-out',
  },
  toastIcon: {
    fontSize: '1.1rem',
  },
  birthdayLabel: {
    display: 'block',
    fontSize: '0.7rem',
    color: '#886677',
    marginBottom: '6px',
    fontWeight: '600',
  },
  birthdayValue: {
    display: 'block',
    fontSize: '0.9rem',
    color: '#333344',
    fontWeight: '600',
    wordBreak: 'break-word',
  },
  txLink: {
    display: 'block',
    fontSize: '0.8rem',
    color: '#f78fb3',
    textDecoration: 'none',
    fontFamily: '"Quicksand", "Nunito", monospace',
    transition: 'color 0.2s',
    fontWeight: '600',
    wordBreak: 'break-all',
  },
  footerSpacer: {
    flex: 1,
    minHeight: '32px',
  },
  footerContainer: {
    paddingTop: '20px',
    borderTop: '1px dashed #f7b3c7',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  footerText: {
    fontSize: '0.8rem',
    color: '#886677',
  },
  footerHeart: {
    fontSize: '0.85rem',
  },
  footerEmoji: {
    fontSize: '1rem',
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
    fontVariantEmoji: 'emoji',
  },
  footerLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: '#f78fb3',
    textDecoration: 'none',
    fontSize: '0.8rem',
    fontWeight: '600',
    transition: 'opacity 0.2s',
  },
  footerSeparator: {
    color: '#ccb5c0',
    fontSize: '0.8rem',
  },
  footerX: {
    fontSize: '0.85rem',
    fontFamily: 'inherit',
    color: '#886677',
  },
};

export default App;
