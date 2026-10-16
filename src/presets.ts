import { defaultReceipt, type ReceiptState } from './receipt';

export type BuiltInPreset = {
  id: string;
  name: string;
  receipt: ReceiptState;
  logoUrl?: string;
};

export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  {
    id: 'builtin-ikizuraibu',
    name: 'いきづらい部！ 2nd LIVE（見本）',
    receipt: defaultReceipt
  },
  {
    id: 'builtin-boom-boom-bee',
    name: 'Boom Boom BEE r/ll Edition',
    receipt: {
      ...defaultReceipt,
      subtitle: 'Boom Boom BEE r/ll Edition',
      dateVenue: '2026年11月15日（日） 20:30 BeeRUSH Nishiki',
      seat: '関係者席 ｱﾘｰﾅ 酒ﾌﾞﾛｯｸ 1列 1番',
      serial: 'S114514',
      notices: [
        '※お気持ち禁止',
        '　上記の違反行為が発覚した場合、即時退場となります。',
        '※再入場はできません。',
        '※USA・アイマス最高など迷惑をかけるコール禁止',
        '※焼酎禁止'
      ],
      logoMode: 'upload',
      logoOffsetX: 0,
      logoOffsetY: 0,
      logoScale: 1
    },
    logoUrl: `${import.meta.env.BASE_URL}presets/lovelive-fest.jpg`
  }
];
