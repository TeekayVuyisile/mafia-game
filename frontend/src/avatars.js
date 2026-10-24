import {
  SuitSpadeFill,
  SuitHeartFill,
  SuitClubFill,
  SuitDiamondFill,
  Incognito,
  EyeFill,
  Gem,
  MoonStarsFill,
  Fire,
  LightningFill
} from 'react-bootstrap-icons';

// Stored in the user's `image` field as `preset:<id>`; anything else is treated as an image URL (e.g. Google photo)
export const AVATAR_PRESETS = [
  { id: 'spade', Icon: SuitSpadeFill, color: '#c8a96b' },
  { id: 'heart', Icon: SuitHeartFill, color: '#b3261e' },
  { id: 'club', Icon: SuitClubFill, color: '#2e8b57' },
  { id: 'diamond', Icon: SuitDiamondFill, color: '#d4574e' },
  { id: 'incognito', Icon: Incognito, color: '#9a9a9a' },
  { id: 'eye', Icon: EyeFill, color: '#6c8ebf' },
  { id: 'gem', Icon: Gem, color: '#8e6cc0' },
  { id: 'moon', Icon: MoonStarsFill, color: '#7f9cc8' },
  { id: 'fire', Icon: Fire, color: '#e07b39' },
  { id: 'lightning', Icon: LightningFill, color: '#e0c341' }
];

export const presetValue = (id) => `preset:${id}`;
