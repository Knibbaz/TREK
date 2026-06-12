import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../tests/helpers/render';
import userEvent from '@testing-library/user-event';
import { resetAllStores, seedStore } from '../../tests/helpers/store';
import { buildUser } from '../../tests/helpers/factories';
import { useAuthStore } from '../store/authStore';
import SettingsPage from './SettingsPage';

// Mock heavy settings sub-tabs to focus on page-level concerns
vi.mock('../components/Settings/DisplaySettingsTab', () => ({
  default: () => <div data-testid="display-settings-tab">Display Settings</div>,
}));

vi.mock('../components/Settings/MapSettingsTab', () => ({
  default: () => <div data-testid="map-settings-tab">Map Settings</div>,
}));

vi.mock('../components/Settings/NotificationsTab', () => ({
  default: () => <div data-testid="notifications-tab">Notifications Settings</div>,
}));

vi.mock('../components/Settings/IntegrationsTab', () => ({
  default: () => <div data-testid="integrations-tab">Integrations Settings</div>,
}));

vi.mock('../components/Settings/AccountTab', () => ({
  default: () => <div data-testid="account-tab">Account Settings</div>,
}));

vi.mock('../components/Settings/AboutTab', () => ({
  default: ({ appVersion }: { appVersion: string }) => (
    <div data-testid="about-tab">About v{appVersion}</div>
  ),
}));

beforeEach(() => {
  resetAllStores();
  seedStore(useAuthStore, { isAuthenticated: true, user: buildUser() });
});

describe('SettingsPage', () => {
  describe('FE-PAGE-SETTINGS-001: Settings page renders', () => {
    it('shows the Settings heading', () => {
      render(<SettingsPage />);
      expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
    });
  });

  describe('FE-PAGE-SETTINGS-002: Default tab (Display) is active', () => {
    it('shows Display tab content by default', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('display-settings-tab')).toBeInTheDocument();
      });
    });
  });

  describe('FE-PAGE-SETTINGS-003: Tab navigation', () => {
    it('switching to Map tab shows map settings content', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /map/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^map$/i }));

      await waitFor(() => {
        expect(screen.getByTestId('map-settings-tab')).toBeInTheDocument();
      });
    });

    it('switching to Account tab shows account settings', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /account/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /account/i }));

      await waitFor(() => {
        expect(screen.getByTestId('account-tab')).toBeInTheDocument();
      });
    });

    it('switching to Notifications tab shows notifications content', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /notifications/i }));

      await waitFor(() => {
        expect(screen.getByTestId('notifications-tab')).toBeInTheDocument();
      });
    });
  });

  describe('FE-PAGE-SETTINGS-004: All standard tabs are present', () => {
    it('renders Display, Map, Notifications, Account tabs', async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /display/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /^map$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /account/i })).toBeInTheDocument();
    });
  });

  describe('FE-PAGE-SETTINGS-005: MFA redirect switches to Account tab', () => {
    it('auto-switches to account tab when ?mfa=required is in URL', async () => {
      render(<SettingsPage />, { initialEntries: ['/settings?mfa=required'] });

      await waitFor(() => {
        expect(screen.getByTestId('account-tab')).toBeInTheDocument();
      });
    });
  });

  // NOTE(ROUTD): About tab removed in the fork — upstream test FE-PAGE-SETTINGS-006 dropped.
});
