import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import RefreshIcon from '@mui/icons-material/Refresh';

export function EmptyState() {
  const rescan = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.runtime.sendMessage({ type: 'RESCAN_PAGE', tabId: tab.id, timestamp: Date.now() });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2, px: 3, textAlign: 'center' }}>
      <VideocamOffIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
      <Typography variant="body1" fontWeight={600} color="text.secondary">No videos detected</Typography>
      <Typography variant="body2" color="text.disabled">
        Navigate to a page with a video — YouTube, Facebook, Instagram, Twitter, Vimeo and more are supported.
      </Typography>
      <Button variant="outlined" size="small" startIcon={<RefreshIcon />} onClick={rescan}>
        Scan Page
      </Button>
    </Box>
  );
}
