/**
 * ADMIN TASK 13 — Notifications screen: broadcast composer + history, and
 * event template settings (enable/disable, edit, reset).
 */
import React from 'react';
import { Alert, Switch } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AdminNotificationsScreen from '../src/screens/admin/AdminNotificationsScreen';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb) => { require('react').useEffect(cb, []); },
}));

jest.mock('../src/api', () => ({
  adminApi: {
    listNotifications: jest.fn(),
    createNotification: jest.fn(),
    deleteNotification: jest.fn(),
    listNotificationTemplates: jest.fn(),
    updateNotificationTemplate: jest.fn(),
    resetNotificationTemplate: jest.fn(),
  },
}));

const { adminApi } = require('../src/api');

function findAllText(root) {
  return root.findAll((n) => n.type === 'Text' && typeof n.props.children !== 'undefined')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
}

function mockAlertCaptureConfirm(buttonText = 'Send') {
  let confirmPromise = null;
  const spy = jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    confirmPromise = buttons.find((b) => b.text === buttonText)?.onPress?.();
  });
  return { spy, getConfirmPromise: () => confirmPromise };
}

describe('AdminNotificationsScreen — Broadcast', () => {
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    adminApi.listNotifications.mockResolvedValue({ data: [] });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => { root.unmount(); });
      root = null;
    }
  });

  it('validates required fields before sending', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(<AdminNotificationsScreen />);
    });

    const sendBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Send broadcast'))[0];
    await act(async () => { sendBtn.props.onPress(); });

    expect(findAllText(root.root)).toEqual(expect.arrayContaining(['Title and body are required']));
    expect(adminApi.createNotification).not.toHaveBeenCalled();
  });

  it('confirms then sends a broadcast to everyone', async () => {
    adminApi.createNotification.mockResolvedValue({ data: { recipientCount: 42 } });
    const { spy: alertSpy, getConfirmPromise } = mockAlertCaptureConfirm('Send');

    await act(async () => {
      root = ReactTestRenderer.create(<AdminNotificationsScreen />);
    });

    const titleInput = root.root.findByProps({ placeholder: 'e.g. Flash Sale Today!' });
    await act(async () => { titleInput.props.onChangeText('Sale!'); });
    const bodyInput = root.root.findByProps({ placeholder: 'Type your message here…' });
    await act(async () => { bodyInput.props.onChangeText('20% off today'); });

    const sendBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Send broadcast'))[0];
    await act(async () => {
      sendBtn.props.onPress();
      await getConfirmPromise();
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(adminApi.createNotification).toHaveBeenCalledWith({ title: 'Sale!', body: '20% off today', type: 'info', target: 'everyone' });
    expect(findAllText(root.root)).toEqual(expect.arrayContaining(['Sent to 42 customers.']));

    alertSpy.mockRestore();
  });

  it('requires at least one phone when targeting specific numbers', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(<AdminNotificationsScreen />);
    });

    const phonesChip = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Specific phones'))[0];
    await act(async () => { phonesChip.props.onPress(); });

    const titleInput = root.root.findByProps({ placeholder: 'e.g. Flash Sale Today!' });
    await act(async () => { titleInput.props.onChangeText('Hi'); });
    const bodyInput = root.root.findByProps({ placeholder: 'Type your message here…' });
    await act(async () => { bodyInput.props.onChangeText('Body'); });

    const sendBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Send broadcast'))[0];
    await act(async () => { sendBtn.props.onPress(); });

    expect(findAllText(root.root)).toEqual(expect.arrayContaining(['Enter at least one phone number to send to specific customers']));
    expect(adminApi.createNotification).not.toHaveBeenCalled();
  });
});

describe('AdminNotificationsScreen — Templates', () => {
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    adminApi.listNotifications.mockResolvedValue({ data: [] });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => { root.unmount(); });
      root = null;
    }
  });

  it('switches to the Templates segment and lists templates', async () => {
    adminApi.listNotificationTemplates.mockResolvedValue({
      data: [{ id: 1, event_key: 'order_placed', title: 'Order placed!', body: 'Thanks', enabled: true }],
    });

    await act(async () => {
      root = ReactTestRenderer.create(<AdminNotificationsScreen />);
    });

    const templatesTab = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Templates'))[0];
    await act(async () => { templatesTab.props.onPress(); });

    expect(findAllText(root.root)).toEqual(expect.arrayContaining(['Order Placed']));
  });

  it('toggles a template enabled state', async () => {
    adminApi.listNotificationTemplates.mockResolvedValue({
      data: [{ id: 1, event_key: 'order_placed', title: 'Order placed!', body: 'Thanks', enabled: true }],
    });
    adminApi.updateNotificationTemplate.mockResolvedValue({ data: { id: 1, event_key: 'order_placed', title: 'Order placed!', body: 'Thanks', enabled: false } });

    await act(async () => {
      root = ReactTestRenderer.create(<AdminNotificationsScreen />);
    });
    const templatesTab = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Templates'))[0];
    await act(async () => { templatesTab.props.onPress(); });

    const toggle = root.root.findByType(Switch);
    await act(async () => { await toggle.props.onValueChange(); });

    expect(adminApi.updateNotificationTemplate).toHaveBeenCalledWith(1, { title: 'Order placed!', body: 'Thanks', enabled: 0 });
  });

  it('confirms before resetting a template to default', async () => {
    adminApi.listNotificationTemplates.mockResolvedValue({
      data: [{ id: 1, event_key: 'order_placed', title: 'Custom title', body: 'Custom body', enabled: true }],
    });
    adminApi.resetNotificationTemplate.mockResolvedValue({ data: { id: 1, event_key: 'order_placed', title: 'Default', body: 'Default body', enabled: true } });
    const { spy: alertSpy, getConfirmPromise } = mockAlertCaptureConfirm('Reset');

    await act(async () => {
      root = ReactTestRenderer.create(<AdminNotificationsScreen />);
    });
    const templatesTab = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Templates'))[0];
    await act(async () => { templatesTab.props.onPress(); });

    const resetBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Reset'))[0];
    await act(async () => {
      resetBtn.props.onPress();
      await getConfirmPromise();
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(adminApi.resetNotificationTemplate).toHaveBeenCalledWith(1);

    alertSpy.mockRestore();
  });
});
