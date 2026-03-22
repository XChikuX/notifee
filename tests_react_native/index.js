import { AppRegistry } from 'react-native';
import notifee from '@psync/notifee';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

import App from './example/app';

// Initialize messaging instance
const messaging = getMessaging();

setBackgroundMessageHandler(messaging, async message => {
  console.log('onBackgroundMessage New FCM Message', message);
});

notifee.onBackgroundEvent(async event => {
  console.log('notifee.onBackgroundEvent triggered: ' + JSON.stringify(event));
});

AppRegistry.registerComponent('testing', () => App);
