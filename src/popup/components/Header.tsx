import React, { useState } from 'react';
import {
  AppBar, Toolbar, Typography, IconButton, Chip, Box,
  Tabs, Tab, Tooltip, CircularProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import BugReportIcon from '@mui/icons-material/BugReport';
import DownloadIcon from '@mui/icons-material/Download';
import CloudIcon from '@mui/icons-material/Cloud';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import { useVideoStore } from '../hooks/useVideoStore';

interface Props {
  tab: 'videos' | 'queue';
  onTabChange: (tab: 'videos' | 'queue') => void;
  videoCount: number;
}

export function Header({ tab, onTabChange, videoCount }: Props) {
  const { loadVideos } = useVideoStore();
  const [scanning, setScanning] = useState(false);
  const [backendOnline] = useState(false); // Updated by backend status check

  const handleRescan = async () => {
    setScanning(true);
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        await chrome.runtime.sendMessage({ type: 'RESCAN_PAGE', tabId: activeTab.id, timestamp: Date.now() });
        await new Promise(r => setTimeout(r, 1200));
        await loadVideos();
      }
    } finally {
      setScanning(false);
    }
  };

  const openOptions = () => chrome.runtime.openOptionsPage();
  const openDebug = () => chrome.tabs.create({ url: chrome.runtime.getURL('debug/index.html') });

  return (
    <AppBar position="static" elevation={0} sx={{ bgcolor: 'primary.main' }}>
      <Toolbar variant="dense" sx={{ minHeight: 52, px: 1.5, gap: 0.5 }}>
        {/* Logo + Title */}
        <VideocamIcon sx={{ fontSize: 22, mr: 0.5 }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1, fontSize: 14 }}>
          Video Downloader
        </Typography>

        {/* Backend status chip */}
        <Chip
          icon={backendOnline ? <CloudIcon sx={{ fontSize: 14 }} /> : <CloudOffIcon sx={{ fontSize: 14 }} />}
          label={backendOnline ? 'API' : 'Local'}
          size="small"
          sx={{
            height: 22,
            fontSize: 11,
            bgcolor: backendOnline ? 'success.dark' : 'warning.dark',
            color: '#fff',
            '& .MuiChip-icon': { color: '#fff' },
          }}
        />

        {/* Video count */}
        {videoCount > 0 && (
          <Chip
            label={`${videoCount} video${videoCount !== 1 ? 's' : ''}`}
            size="small"
            sx={{ height: 22, fontSize: 11, bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' }}
          />
        )}

        {/* Actions */}
        <Tooltip title="Re-scan page">
          <span>
            <IconButton size="small" onClick={handleRescan} disabled={scanning} sx={{ color: '#fff' }}>
              {scanning ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Debug panel">
          <IconButton size="small" onClick={openDebug} sx={{ color: '#fff' }}>
            <BugReportIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="Settings">
          <IconButton size="small" onClick={openOptions} sx={{ color: '#fff' }}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Toolbar>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => onTabChange(v)}
        textColor="inherit"
        indicatorColor="secondary"
        sx={{ minHeight: 36, px: 1, '& .MuiTab-root': { minHeight: 36, fontSize: 12, py: 0 } }}
      >
        <Tab value="videos" label="Detected Videos" icon={<VideocamIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
        <Tab value="queue" label="Downloads" icon={<DownloadIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
      </Tabs>
    </AppBar>
  );
}
