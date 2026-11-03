import { Linking } from 'react-native';
import type { StorefrontArticleBlock } from './StorefrontArticlePage';
import { useStorefrontActions } from './StorefrontChrome';
import {
  HANUKKAH_2027_NOTIFY_INTEREST,
  HIGH_HOLIDAYS_SUKKOT_2027_INTEREST,
  PASSOVER_NOTIFY_INTEREST,
  PRE_REGISTERED_CTA_LABEL,
  PRE_REGISTERED_NOTE,
} from '../../constants/pilotHolidays';
import { PASSOVER_COPY } from '../../constants/storefrontPassoverCopy';
import { spacing } from '../../constants/theme';
import { useStorefrontInterest } from '../../hooks/useStorefrontInterest';

/** "Hanukkah and then what?" roadmap + Lunar Cycle CTA article blocks. */
export function useHolidayRoadmapBlocks(options: { shopMode?: boolean } = {}): StorefrontArticleBlock[] {
  const { shopMode = false } = options;
  const { startBox, goCategory } = useStorefrontActions();
  const { roadmap, lunarCycle } = PASSOVER_COPY;
  const passover = useStorefrontInterest(PASSOVER_NOTIFY_INTEREST);
  const highHolidays = useStorefrontInterest(HIGH_HOLIDAYS_SUKKOT_2027_INTEREST);
  const hanukkah2027 = useStorefrontInterest(HANUKKAH_2027_NOTIFY_INTEREST);

  const interestByKey: Record<string, ReturnType<typeof useStorefrontInterest>> = {
    [PASSOVER_NOTIFY_INTEREST]: passover,
    [HIGH_HOLIDAYS_SUKKOT_2027_INTEREST]: highHolidays,
    [HANUKKAH_2027_NOTIFY_INTEREST]: hanukkah2027,
  };

  return [
    {
      type: 'roadmap',
      heading: roadmap.heading,
      groups: roadmap.groups.map((group) => ({
        items: group.items.map((item) => {
          const ctaLabel = 'ctaLabel' in item ? item.ctaLabel : undefined;
          const ctaAction = 'ctaAction' in item ? item.ctaAction : undefined;
          const interestKey = 'interestKey' in item ? item.interestKey : undefined;
          const isStartBox = ctaAction === 'startBox';
          const ctaVariant = 'ctaVariant' in item && item.ctaVariant ? item.ctaVariant : undefined;
          const interest = interestKey ? interestByKey[interestKey] : undefined;
          const marked = Boolean(interest?.marked);
          const shopStartBox = shopMode && isStartBox;
          const label = marked
            ? PRE_REGISTERED_CTA_LABEL
            : shopStartBox
              ? 'Shop the collection'
              : ctaLabel;
          return {
            when: item.when,
            what: item.what,
            cta: label
              ? {
                  label,
                  onPress: shopStartBox
                    ? () => goCategory('collection')
                    : isStartBox
                      ? startBox
                      : interest
                        ? interest.toggle
                        : passover.toggle,
                }
              : undefined,
            // Marked pre-registers use gold fill; otherwise Hanukkah primary / others outline.
            ctaVariant: ctaLabel || shopStartBox
              ? ((marked || ctaVariant === 'primary' || shopStartBox ? 'primary' : 'outline') as
                  | 'primary'
                  | 'outline')
              : undefined,
            ctaNote: marked && !isStartBox ? PRE_REGISTERED_NOTE : undefined,
          };
        }),
      })),
    },
    {
      type: 'cta',
      heading: lunarCycle.heading,
      cta: {
        label: lunarCycle.ctaLabel,
        onPress: () => {
          void Linking.openURL(lunarCycle.url);
        },
      },
      ctaVariant: 'outline',
      paddingBottom: spacing.xl,
    },
  ];
}
