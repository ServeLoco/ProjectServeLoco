
import './Button.css';

export default function Button({
  children,
  variant = 'primary', // primary, success, highlight, outline
  size = 'normal', // normal, small
  disabled = false,
  loading = false,
  loadingText,
  onClick,
  className = '',
  type = 'button',
  style
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${size === 'small' ? 'btn-small' : ''} ${loading ? 'btn-loading' : ''} ${className}`}
      disabled={isDisabled}
      onClick={onClick}
      style={style}
      aria-busy={loading || undefined}
    >
      {loading ? (loadingText ?? 'Loading…') : children}
    </button>
  );
}
