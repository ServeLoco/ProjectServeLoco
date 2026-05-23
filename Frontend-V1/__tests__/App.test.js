/**
 * @format
 */

import React from 'react';
import App from '../App';
import ReactTestRenderer from 'react-test-renderer';

beforeAll(() => {
  jest.useFakeTimers();
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });
});
