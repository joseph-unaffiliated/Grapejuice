import 'react-native';

declare module 'react-native' {
  interface PressableStateCallbackType {
    /** Set by react-native-web while the pointer is over the element; undefined on native. */
    readonly hovered?: boolean;
  }
}
