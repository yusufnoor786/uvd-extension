import React, { useEffect, useState } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
} from '@mui/material';
import { useVideoStore } from './hooks/useVideoStore';
import { useSettingsStore } from './hooks/useSettingsStore';
import { Header } from './components/Header';
import { VideoList } from './components/VideoList';
import { EmptyState } from './components/EmptyState';
import { LoadingState } from './components/LoadingState';
import { DownloadQueue } from './components/DownloadQueue';
import type { ExtensionMessage } from '../types';

type Tab = 'videos' | 'queue';

export default function App() {
  const { settings, loadSettings } = useSettingsStore();
  const { videos, activeVideo, loadVideos, handleMessage } = useVideoStore();
  const [tab, setTab] = useState<Tab>('videos');
  const [loading, setLoading] = useState(true);

  // Determine theme
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const mode =
    settings?.ui.theme === 'system'
      ? prefersDark ? 'dark' : 'light'
      : settings?.ui.theme || 'light';

  const theme = createTheme({
    palette: {
      mode: mode as 'light' | 'dark',
      primary: { main: '#6750A4' },
      secondary: { main: '#625B71' },
      background: {
        default: mode === 'dark' ? '#1C1B1F' : '#FFFBFE',
        paper: mode === 'dark' ? '#2B2930' : '#FFFFFF',
      },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Google Sans", "Roboto", sans-serif',
      fontSize: 13,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', borderRadius: 20, fontWeight: 500 },
        },
      },
      MuiChip: {
        styleOverrides: { root: { borderRadius: 8 } },
      },
    },
  });

  useEffect(() => {
    Promise.all([loadSettings(), loadVideos()]).finally(() => setLoading(false));

    // Listen for real-time messages from background
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const msg = event.data as ExtensionMessage;
      if (msg?.type) handleMessage(msg);
    };
    window.addEventListener('message', onMessage);

    // Also listen via chrome runtime
    const runtimeListener = (message: ExtensionMessage) => handleMessage(message);
    chrome.runtime.onMessage.addListener(runtimeListener);

    return () => {
      window.removeEventListener('message', onMessage);
      chrome.runtime.onMessage.removeListener(runtimeListener);
    };
  }, []);

  if (loading) return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LoadingState />
    </ThemeProvider>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        width: 420,
        height: 600,
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}>
        <Header
          tab={tab}
          onTabChange={setTab}
          videoCount={videos.length}
        />

        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {tab === 'videos' ? (
            videos.length === 0 ? (
              <EmptyState />
            ) : (
              <VideoList videos={videos} activeVideo={activeVideo} />
            )
          ) : (
            <DownloadQueue />
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
