// Mock for firebase-admin/auth in Jest.
module.exports = {
  getAuth: jest.fn(() => ({
    verifyIdToken: jest.fn(async () => ({
      uid: 'mock-firebase-uid',
      phone_number: '+919999999999',
    })),
  })),
};
