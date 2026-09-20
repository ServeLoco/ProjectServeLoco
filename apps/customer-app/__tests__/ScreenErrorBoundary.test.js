/**
 * The app used to have exactly one ErrorBoundary, at the root, so a render
 * error anywhere replaced the WHOLE app with the recovery screen — tab bar
 * gone, back stack gone, nothing to do but restart. Every navigator now wires
 * ScreenErrorBoundary through `screenLayout`, giving each screen its own
 * barrier.
 *
 * What is worth pinning: a broken screen is contained, the fallback itself can
 * never throw (a fallback that throws puts us right back where we started),
 * and the error reaches Crashlytics tagged with the route.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ScreenErrorBoundary from '../src/components/ErrorBoundary/ScreenErrorBoundary';
import { recordHandledError } from '../src/utils/crashReporting';

jest.mock('../src/utils/crashReporting', () => ({
  recordHandledError: jest.fn(),
  logBreadcrumb: jest.fn(),
}));

function Boom() {
  throw new Error('screen exploded');
}

function texts(root) {
  return root
    .findAll((n) => n.type === 'Text' && typeof n.props.children !== 'undefined')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
}

describe('ScreenErrorBoundary', () => {
  let root;
  let consoleError;

  beforeEach(() => {
    jest.clearAllMocks();
    // React logs caught render errors; that noise is expected here.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    if (root) {
      await act(async () => { root.unmount(); });
      root = null;
    }
    consoleError.mockRestore();
  });

  it('renders its screen normally when nothing is wrong', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(
        <ScreenErrorBoundary routeName="Home">
          <Text>the real screen</Text>
        </ScreenErrorBoundary>
      );
    });
    expect(texts(root.root)).toContain('the real screen');
  });

  it('shows a recovery card instead of the screen when it throws', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(
        <ScreenErrorBoundary routeName="ProductDetail">
          <Boom />
        </ScreenErrorBoundary>
      );
    });
    expect(texts(root.root)).toContain('This screen ran into a problem');
  });

  it('reports the error tagged with the route it came from', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(
        <ScreenErrorBoundary routeName="ProductDetail">
          <Boom />
        </ScreenErrorBoundary>
      );
    });
    expect(recordHandledError).toHaveBeenCalledWith(
      expect.any(Error),
      'ScreenRenderError:ProductDetail'
    );
  });

  /**
   * The fallback reads NavigationContext rather than calling useNavigation(),
   * which throws when there is no navigator above it. If the fallback could
   * throw, the boundary would fail to render its own recovery UI and the error
   * would escape to the root boundary — blanking the whole app, the exact
   * thing this component exists to prevent.
   */
  it('renders its fallback even with no navigator anywhere above it', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(
        <ScreenErrorBoundary routeName="Orphan">
          <Boom />
        </ScreenErrorBoundary>
      );
    });
    expect(texts(root.root)).toContain('This screen ran into a problem');
    // No navigator means nothing to go back to, so only the retry is offered.
    expect(texts(root.root)).toContain('Try again');
    expect(texts(root.root)).not.toContain('Go back');
  });

  it('re-renders the screen when the error clears and Try again is tapped', async () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('first render only');
      return <Text>recovered screen</Text>;
    }

    await act(async () => {
      root = ReactTestRenderer.create(
        <ScreenErrorBoundary routeName="Flaky">
          <Flaky />
        </ScreenErrorBoundary>
      );
    });
    expect(texts(root.root)).toContain('This screen ran into a problem');

    shouldThrow = false;
    const retry = root.root
      .findAll((n) => typeof n.props?.onPress === 'function' && n.props?.label === 'Try again')[0];
    await act(async () => { retry.props.onPress(); });

    expect(texts(root.root)).toContain('recovered screen');
  });

  describe('inside a real navigator', () => {
    it('contains the failure to the one broken screen', async () => {
      const Stack = createNativeStackNavigator();

      await act(async () => {
        root = ReactTestRenderer.create(
          <NavigationContainer>
            <Stack.Navigator
              screenOptions={{ headerShown: false }}
              screenLayout={({ children, route }) => (
                <ScreenErrorBoundary routeName={route?.name}>{children}</ScreenErrorBoundary>
              )}
            >
              <Stack.Screen name="Broken" component={Boom} />
            </Stack.Navigator>
          </NavigationContainer>
        );
      });

      // The navigator itself survived and rendered the recovery card in the
      // screen's place, rather than the error tearing the container down.
      expect(texts(root.root)).toContain('This screen ran into a problem');
      expect(recordHandledError).toHaveBeenCalledWith(
        expect.any(Error),
        'ScreenRenderError:Broken'
      );
    });
  });
});
