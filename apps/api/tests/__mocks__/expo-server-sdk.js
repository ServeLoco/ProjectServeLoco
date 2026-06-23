class Expo {
  static isExpoPushToken(token) {
    return typeof token === 'string' && token.startsWith('ExponentPushToken[');
  }

  chunkPushNotifications(messages) {
    return [messages];
  }

  async sendPushNotificationsAsync() {
    return [];
  }
}

module.exports = { Expo };
