import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Animated,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Icon } from '../ui/Icon';
import { GrapejuiceBrandMark } from '../brand/GrapejuiceBrandMark';
import { icons } from '../../constants/icons';
import { STOREFRONT_CATEGORIES } from '../../constants/storefrontCategories';
import type { MainStackParamList } from '../../navigation/types';
import { openBoxSurface } from '../../navigation/boxEntry';
import { usePreviewedHasStartedBox, usePreviewedIsAuthenticated } from '../../hooks/useUserStatePreview';
import {
  semanticColors,
  spacing,
  typeface,
  typography,
} from '../../constants/theme';
import { useStorefrontLeave } from './storefrontLeaveContext';
import { useStorefrontRav } from './storefrontRavContext';

type Nav = StackNavigationProp<MainStackParamList>;

type Props = {
  visible: boolean;
  onClose: () => void;
};

type NavLink = { label: string; onPress: () => void };
type NavSection = { heading: string; links: NavLink[] };

const DRAWER_MS = 260;
const HEADER_PAD = 16;

/**
 * Full-screen storefront nav drawer — slides in from the left on mobile.
 */
export function StorefrontMobileNav({ visible, onClose }: Props) {
  const navigation = useNavigation<Nav>();
  const leave = useStorefrontLeave();
  const { openRav } = useStorefrontRav();
  const isAuthenticated = usePreviewedIsAuthenticated();
  const hasOwnBox = usePreviewedHasStartedBox();
  const { width } = useWindowDimensions();
  const slide = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      slide.setValue(0);
      Animated.timing(slide, {
        toValue: 1,
        duration: DRAWER_MS,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!mounted) return;
    Animated.timing(slide, {
      toValue: 0,
      duration: DRAWER_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, mounted, slide]);

  const sections = useMemo((): NavSection[] => {
    const goCategory = (slug: string) => {
      onClose();
      if (leave) {
        leave({ type: 'category', slug });
        return;
      }
      navigation.navigate('StorefrontCategory', { category: slug });
    };
    const go = (fn: () => void) => {
      onClose();
      fn();
    };

    const startBox = () =>
      openBoxSurface(isAuthenticated, leave ? () => leave({ type: 'myBox' }) : undefined);

    return [
      {
        heading: 'Marketplace',
        links: [
          { label: 'Shop all', onPress: () => goCategory('collection') },
          ...STOREFRONT_CATEGORIES.filter((c) => c.slug !== 'collection').map((c) => ({
            label: c.label,
            onPress: () => goCategory(c.slug),
          })),
        ],
      },
      {
        heading: 'Seasonal boxes',
        links: [
          { label: '2026 Hanukkah Box', onPress: () => go(startBox) },
          {
            label: '2027 Passover',
            onPress: () =>
              go(() => {
                if (leave) {
                  leave({ type: 'service', id: 'passover' });
                  return;
                }
                navigation.navigate('StorefrontPassover');
              }),
          },
          ...(hasOwnBox
            ? [
                {
                  label: 'My Box',
                  onPress: () =>
                    go(() => {
                      if (leave) {
                        leave({ type: 'myBox' });
                        return;
                      }
                      navigation.navigate('MyBox');
                    }),
                },
              ]
            : []),
        ],
      },
      {
        heading: 'Company',
        links: [
          {
            label: 'Our story',
            onPress: () =>
              go(() => {
                if (leave) {
                  leave({ type: 'service', id: 'story' });
                  return;
                }
                navigation.navigate('StorefrontOurStory');
              }),
          },
          {
            label: 'Store home',
            onPress: () =>
              go(() => {
                if (leave) {
                  leave({ type: 'home' });
                  return;
                }
                navigation.navigate('StorefrontHome');
              }),
          },
          {
            label: 'Account',
            onPress: () => go(() => navigation.navigate('MainTabs', { screen: 'Account' })),
          },
        ],
      },
      {
        heading: 'Contact',
        links: [
          {
            label: 'Ask Rav',
            onPress: () =>
              go(() => {
                if (leave) {
                  openRav();
                  return;
                }
                navigation.navigate('MainTabs', { screen: 'Rav', params: { view: 'welcome' } });
              }),
          },
          {
            label: 'hello@grapejuice.com',
            onPress: () => {
              onClose();
              void Linking.openURL('mailto:hello@grapejuice.com');
            },
          },
        ],
      },
    ];
  }, [hasOwnBox, isAuthenticated, leave, navigation, onClose, openRav]);

  if (!mounted) return null;

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, 0],
  });
  const backdropOpacity = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.35],
  });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
        </Animated.View>
        <Animated.View
          style={[
            styles.drawer,
            {
              transform: [{ translateX }],
            },
          ]}
          accessibilityRole="menu"
          accessibilityLabel="Store menu"
        >
          <View style={styles.drawerHeader}>
            <GrapejuiceBrandMark markOnly compact color={semanticColors.logoDark} decorative />
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              hitSlop={12}
              style={styles.closeHit}
            >
              <Icon icon={icons.close} size={18} color={semanticColors.logoDark} />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={styles.heading}>{section.heading}</Text>
                {section.links.map((link) => (
                  <TouchableOpacity
                    key={link.label}
                    style={styles.linkHit}
                    onPress={link.onPress}
                    accessibilityRole="menuitem"
                    accessibilityLabel={link.label}
                  >
                    <Text style={styles.link}>{link.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  drawer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: semanticColors.bgPrimary,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '8px 0 32px rgba(17, 2, 34, 0.18)',
        } as object)
      : {
          shadowColor: '#110222',
          shadowOffset: { width: 8, height: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
          elevation: 16,
        }),
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HEADER_PAD,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  closeHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: HEADER_PAD,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  heading: {
    ...typeface('medium'),
    fontSize: typography.sm,
    color: semanticColors.textSecondary,
    letterSpacing: -0.2,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  linkHit: {
    paddingVertical: spacing.sm,
  },
  link: {
    ...typeface('regular'),
    fontSize: 17,
    color: semanticColors.logoDark,
    letterSpacing: -0.3,
  },
});
