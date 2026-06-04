import React, { useEffect } from 'react';
import {
  Box, Typography, List, ListItem, ListItemText,
  LinearProgress, IconButton, Chip, Tooltip,
} from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import type { DownloadJob } from '../../types';
import { formatBytes, formatSpeed, formatEta } from '../../utils/helpers';
import { useDownloadStore } from '../hooks/useDownloadStore';

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info'> = {
  queued: 'default',
  analyzing: 'info',
  extracting: 'info',
  downloading: 'primary',
  processing: 'warning',
  merging: 'warning',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
  paused: 'warning',
};

export function DownloadQueue() {
  const { jobs, loadJobs, cancelJob, pauseJob, resumeJob, handleMessage } = useDownloadStore();

  useEffect(() => {
    loadJobs();
    const listener = (msg: any) => handleMessage(msg);
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  if (jobs.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary" variant="body2">No downloads yet</Typography>
      </Box>
    );
  }

  return (
    <List dense sx={{ p: 0 }}>
      {jobs.map(job => <JobItem key={job.id} job={job} onCancel={cancelJob} onPause={pauseJob} onResume={resumeJob} />)}
    </List>
  );
}

function JobItem({ job, onCancel, onPause, onResume }: {
  job: DownloadJob;
  onCancel: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const isActive = job.status === 'downloading' || job.status === 'processing' || job.status === 'merging';
  const isPaused = job.status === 'paused';
  const isDone = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled';

  return (
    <ListItem
      sx={{
        px: 1.5, py: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        {/* Status icon */}
        <Box sx={{ mt: 0.25 }}>
          {job.status === 'completed' && <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main' }} />}
          {job.status === 'failed' && <ErrorIcon sx={{ fontSize: 18, color: 'error.main' }} />}
          {!['completed', 'failed', 'cancelled'].includes(job.status) && (
            <Chip label={job.status} size="small" color={STATUS_COLORS[job.status] || 'default'}
              sx={{ height: 18, fontSize: 10 }} />
          )}
        </Box>

        {/* Title + quality */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap fontWeight={500} title={job.title}>
            {job.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {job.stream.quality} · {job.stream.format.toUpperCase()}
            {job.fileSize && ` · ~${formatBytes(job.fileSize)}`}
          </Typography>
        </Box>

        {/* Actions */}
        {!isDone && (
          <Box>
            {isActive && (
              <Tooltip title="Pause">
                <IconButton size="small" onClick={() => onPause(job.id)}>
                  <PauseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            {isPaused && (
              <Tooltip title="Resume">
                <IconButton size="small" onClick={() => onResume(job.id)}>
                  <PlayArrowIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Cancel">
              <IconButton size="small" onClick={() => onCancel(job.id)}>
                <CancelIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      {/* Progress bar */}
      {isActive && (
        <Box sx={{ mt: 0.75 }}>
          <LinearProgress variant="determinate" value={job.progress} sx={{ borderRadius: 1, height: 4 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
            <Typography variant="caption" color="text.secondary">
              {job.progress}%
              {job.speed && ` · ${formatSpeed(job.speed)}`}
            </Typography>
            {job.eta && (
              <Typography variant="caption" color="text.secondary">ETA: {formatEta(job.eta)}</Typography>
            )}
          </Box>
        </Box>
      )}

      {job.status === 'failed' && job.error && (
        <Typography variant="caption" color="error.main" sx={{ mt: 0.5 }}>
          {job.error}
        </Typography>
      )}
    </ListItem>
  );
}
