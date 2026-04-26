jest.mock(
  'react-native/Libraries/vendor/emitter/EventEmitter',
  () => {
    return jest.fn().mockImplementation(() => ({
      addListener: jest.fn(),
      removeListener: jest.fn(),
      emit: jest.fn(),
    }));
  },
  { virtual: true },
);

jest.mock(
  'react-native',
  () => {
    const mockModule = {
      addListener: () => jest.fn(),
      getConstants: () => ({ ANDROID_API_LEVEL: 33 }),
      ANDROID_API_LEVEL: 33,
    };

    return {
      NativeModules: {
        NotifeeApiModule: mockModule,
      },
      TurboModuleRegistry: {
        getEnforcing: jest.fn(() => mockModule),
      },
      NativeEventEmitter: jest.fn().mockImplementation(() => ({
        addListener: jest.fn(),
        removeListener: jest.fn(),
        emit: jest.fn(),
      })),
      Platform: {
        OS: 'android',
        Version: 123,
      },
      Image: {
        resolveAssetSource: jest.fn(source => source),
      },
      AppRegistry: {
        registerHeadlessTask: jest.fn(),
      },
      AppState: {
        currentState: 'active',
      },
    };
  },
  { virtual: true },
);

const withNotifee = require('../../packages/react-native/app.plugin');
const { normalizeProps, validateProps } = require('../../packages/react-native/plugin/utils');

describe('Expo config plugin', () => {
  test('exports a plugin function', () => {
    expect(typeof withNotifee).toBe('function');
  });

  test('normalizes sensible defaults', () => {
    const normalized = normalizeProps(
      {
        ios: {
          appleTeamId: 'ABCDE12345',
          bundleIdentifier: 'dev.psync.notifee',
        },
      },
      {
        enableNotificationServiceExtension: true,
      },
    );

    expect(normalized.appleDevTeamId).toBe('ABCDE12345');
    expect(normalized.backgroundModes).toBeUndefined();
    expect(normalized.extensionName).toBe('NotifeeNotificationService');
    expect(normalized.extensionBundleIdentifier).toBe(
      'dev.psync.notifee.NotifeeNotificationService',
    );
    expect(normalized.appGroupName).toBe('group.dev.psync.notifee.notifee');
    expect(normalized.iosSoundFiles).toEqual([]);
  });

  test('supports nested notification service extension config', () => {
    const normalized = normalizeProps(
      {
        ios: {
          appleTeamId: 'ABCDE12345',
          bundleIdentifier: 'dev.psync.notifee',
          deploymentTarget: '16.0',
        },
      },
      {
        notificationServiceExtension: {
          appGroupName: 'group.dev.psync.custom',
          bundleIdentifier: 'dev.psync.notifee.richpush',
          customSourceFilePath: './ios/NotificationService.m',
          deploymentTarget: '17.0',
          enabled: true,
          entitlements: {
            'com.apple.developer.networking.wifi-info': true,
          },
          infoPlist: {
            MyCustomKey: 'present',
          },
          name: 'RichPushExtension',
        },
      },
    );

    expect(normalized.enableNotificationServiceExtension).toBe(true);
    expect(normalized.extensionName).toBe('RichPushExtension');
    expect(normalized.extensionBundleIdentifier).toBe('dev.psync.notifee.richpush');
    expect(normalized.iosDeploymentTarget).toBe('17.0');
    expect(normalized.appGroupName).toBe('group.dev.psync.custom');
    expect(normalized.extensionEntitlements).toEqual({
      'com.apple.developer.networking.wifi-info': true,
    });
    expect(normalized.extensionInfoPlist).toEqual({
      MyCustomKey: 'present',
    });
  });

  test('keeps explicit background modes opt-in', () => {
    const normalized = normalizeProps(
      {
        ios: {
          bundleIdentifier: 'dev.psync.notifee',
        },
      },
      {
        backgroundModes: ['remote-notification'],
      },
    );

    expect(normalized.backgroundModes).toEqual(['remote-notification']);
  });

  test('rejects invalid APS environment values', () => {
    expect(() =>
      validateProps(
        normalizeProps(
          { ios: { bundleIdentifier: 'dev.psync.notifee' } },
          { apsEnvMode: 'staging' },
        ),
      ),
    ).toThrow(/apsEnvMode/);
  });

  test('requires bundle identifier when extension automation is enabled', () => {
    expect(() =>
      validateProps(
        normalizeProps(
          {
            ios: {},
          },
          {
            enableNotificationServiceExtension: true,
          },
        ),
      ),
    ).toThrow(/bundleIdentifier/);
  });

  test('rejects invalid android sound file entries', () => {
    expect(() =>
      validateProps(
        normalizeProps(
          { ios: { bundleIdentifier: 'dev.psync.notifee' } },
          {
            androidSoundFiles: [{ name: 'My Sound', path: './assets/chime.wav' }],
          },
        ),
      ),
    ).toThrow(/androidSoundFiles|Android sound/);
  });

  test('rejects invalid ios sound file entries', () => {
    expect(() =>
      validateProps(
        normalizeProps(
          { ios: { bundleIdentifier: 'dev.psync.notifee' } },
          { iosSoundFiles: ['ding.mp3', ''] },
        ),
      ),
    ).toThrow(/iosSoundFiles/);
  });
});
