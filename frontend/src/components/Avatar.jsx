import { AVATAR_PRESETS, presetValue } from '../avatars';

const Avatar = ({ image, name, size = 40 }) => {
  const preset = typeof image === 'string' && image.startsWith('preset:')
    ? AVATAR_PRESETS.find(p => presetValue(p.id) === image)
    : null;

  const frame = {
    width: size,
    height: size,
    minWidth: size,
    borderRadius: '50%',
    border: '1px solid rgba(200, 169, 107, 0.5)',
    background: 'rgba(200, 169, 107, 0.08)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  };

  if (preset) {
    const { Icon, color } = preset;
    return (
      <span style={{ ...frame, borderColor: color }} aria-label={`${name || 'Player'} avatar`}>
        <Icon size={size * 0.5} color={color} />
      </span>
    );
  }

  if (image) {
    return <img src={image} alt={`${name || 'Player'} avatar`} referrerPolicy="no-referrer" style={{ ...frame, objectFit: 'cover' }} />;
  }

  return (
    <span style={{ ...frame, color: 'var(--accent-gold)', fontFamily: 'var(--font-title)', fontSize: size * 0.42 }} aria-label={`${name || 'Player'} avatar`}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
};

export default Avatar;
