import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

export function LoadingState() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
      <CircularProgress size={40} />
      <Typography variant="body2" color="text.secondary">Detecting videos…</Typography>
      <Typography variant="caption" color="text.disabled">If this takes too long, refresh the page first</Typography>
    </Box>
  );
}
