import { useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

/**
 * A small dependency-free slider built from the RN responder system, so it works
 * identically on native and web (the @react-native-community/slider native module
 * has no web build and crashes when bundled for web).
 */
export function QuantitySlider({
  value,
  min = 0,
  max = 100,
  onChange,
  color = '#5B9BD5',
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  color?: string;
}) {
  const [trackW, setTrackW] = useState(0);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const ratio = max > min ? (clamp(value) - min) / (max - min) : 0;

  const setFromX = (x: number) => {
    if (trackW <= 0) return;
    const r = Math.max(0, Math.min(1, x / trackW));
    onChange(Math.round(min + r * (max - min)));
  };
  const onTouch = (e: GestureResponderEvent) => setFromX(e.nativeEvent.locationX);

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.bubble, { left: `${ratio * 100}%`, backgroundColor: color, pointerEvents: 'none' }]}>
        <Text style={styles.bubbleText}>{clamp(value)}</Text>
      </View>
      <View
        style={styles.hitArea}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
        </View>
        <View style={[styles.thumb, { left: `${ratio * 100}%`, borderColor: color, pointerEvents: 'none' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 14 },
  bubble: {
    position: 'absolute',
    top: 0,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    transform: [{ translateX: -12 }],
    zIndex: 2,
  },
  bubbleText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  hitArea: { height: 34, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#d7dee4', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  thumb: {
    position: 'absolute',
    top: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 3,
    marginLeft: -10,
    // shadow (native) / elevation (android)
    elevation: 2,
  },
});
