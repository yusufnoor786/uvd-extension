import React, { useState } from 'react';
import {
  Card, CardContent, CardMedia, Box, Typography, Chip,
  Divider, Collapse, IconButton, Tooltip, Button,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DownloadIcon from '@mui/icons-material/Download';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LockIcon from '@mui/icons-material/Lock';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import type { DetectedVideo, VideoStream, DownloadMethod } from '../../types';
import {
  formatDuration, formatBytes, formatBitrate,
  PLATFORM_NAMES, PLATFORM_COLORS, formatQualityLabel,
} from '../../utils/helpers';
import { QualityButton } from './QualityButton';
import { useSettingsStore } from '../hooks/useSettingsStore';
import { createLogger } from '../../utils/logger';

const log = createLogger('VideoCard');

interface Props {
  video: DetectedVideo;
  isActive: boolean;
}

export function VideoCard({ video, isActive }: Props) {
  const { settings } = useSettingsStore();
  const [expanded, setExpanded] = useState(isActive);
  const meta = video.metadata;

  const platformColor = PLATFORM_COLORS[video.platform] || '#6750A4';
  const platformName = PLATFORM_NAMES[video.platform] || 'Video';

  const handleDownload = async (stream: VideoStream, method: DownloadMethod = 'browser') => {
    try {
      const streamIndex = meta?.videoStreams.indexOf(stream) ?? 0;
      await chrome.runtime.sendMessage({
        type: 'START_DOWNLOAD',
        payload: { videoId: video.id, streamIndex, method },
        timestamp: Date.now(),
      });
      log.info('Download started', { videoId: video.id, quality: stream.quality });
    } catch (err) {
      log.error('Download failed to start', { error: String(err) });
    }
  };

  if (!meta) {
    return (
      <Card variant="outlined" sx={{ borderRadius: 2, borderColor: isActive ? 'primary.main' : 'divider' }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Typography variant="caption" color="text.secondary">
            Video detected — loading metadata…
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        borderColor: isActive ? 'primary.main' : 'divider',
        borderWidth: isActive ? 2 : 1,
        overflow: 'hidden',
      }}
    >
      {/* Thumbnail + title row */}
      <Box sx={{ display: 'flex', gap: 1.5, p: 1.5, pb: 1 }}>
        {settings.ui.showThumbnails && meta.thumbnail ? (
          <Box sx={{ position: 'relative', flexShrink: 0 }}>
            <CardMedia
              component="img"
              image={meta.thumbnail}
              sx={{ width: 80, height: 52, borderRadius: 1, objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            {meta.duration && (
              <Box sx={{
                position: 'absolute', bottom: 2, right: 2,
                bgcolor: 'rgba(0,0,0,0.75)', color: '#fff',
                borderRadius: 0.5, px: 0.5, fontSize: 10,
              }}>
                {formatDuration(meta.duration)}
              </Box>
            )}
            {meta.isLive && (
              <Chip label="LIVE" size="small" color="error"
                sx={{ position: 'absolute', top: 2, left: 2, height: 16, fontSize: 9, fontWeight: 700 }} />
            )}
          </Box>
        ) : null}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap title={meta.title}>
            {meta.title}
          </Typography>
          {meta.author && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {meta.author}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
            <Chip
              label={platformName}
              size="small"
              sx={{ height: 18, fontSize: 10, bgcolor: platformColor + '22', color: platformColor, fontWeight: 600 }}
            />
            {meta.videoStreams.length > 0 && !meta.hasDRM && (
              <Chip
                label={`${meta.videoStreams.length} ${meta.videoStreams.length === 1 ? 'quality' : 'qualities'}`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ height: 18, fontSize: 10 }}
              />
            )}
            {meta.hasDRM && (
              <Chip
                icon={<LockIcon sx={{ fontSize: '12px !important' }} />}
                label="DRM"
                size="small"
                color="error"
                sx={{ height: 18, fontSize: 10 }}
              />
            )}
          </Box>
        </Box>

        <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ alignSelf: 'flex-start' }}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      {/* DRM Warning */}
      {meta.hasDRM && (
        <Box sx={{ mx: 1.5, mb: 1, p: 1, bgcolor: 'error.light', borderRadius: 1, color: 'error.contrastText' }}>
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LockIcon sx={{ fontSize: 14 }} />
            DRM-protected content ({meta.drmType || 'Unknown'}) — direct download unavailable.
            Backend extraction may assist with non-encrypted streams.
          </Typography>
        </Box>
      )}

      {/* Expanded: quality grid + metadata */}
      <Collapse in={expanded && !meta.hasDRM}>
        <Divider />
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>

          {/* Metadata row */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            {meta.duration && (
              <MetaStat label="Duration" value={formatDuration(meta.duration)} />
            )}
            {meta.videoStreams[0]?.bitrate && (
              <MetaStat label="Bitrate" value={formatBitrate(meta.videoStreams[0].bitrate)} />
            )}
            {meta.videoStreams[0]?.fps && (
              <MetaStat label="FPS" value={`${meta.videoStreams[0].fps}`} />
            )}
            {meta.videoStreams[0]?.codec && (
              <MetaStat label="Codec" value={meta.videoStreams[0].codec.split(';')[0].replace('video/', '')} />
            )}
          </Box>

          {/* Quality buttons */}
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
            Available Qualities
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {meta.videoStreams.map((stream, idx) => (
              <QualityButton
                key={idx}
                stream={stream}
                onDownload={(method) => handleDownload(stream, method)}
              />
            ))}
          </Box>

          {/* Audio only options */}
          {meta.audioStreams.length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, mb: 0.75, display: 'block' }}>
                Audio Only
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {meta.audioStreams.map((stream, idx) => (
                  <Button
                    key={idx}
                    size="small"
                    variant="outlined"
                    startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
                    onClick={() => handleDownload({ ...stream, quality: 'audio', format: stream.format as any, requiresMerge: false }, 'browser')}
                    sx={{ fontSize: 11, height: 28, borderRadius: 2 }}
                  >
                    {stream.label || `Audio ${idx + 1}`} {stream.bitrate ? `· ${formatBitrate(stream.bitrate)}` : ''}
                  </Button>
                ))}
              </Box>
            </>
          )}
        </CardContent>
      </Collapse>
    </Card>
  );
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>{label}</Typography>
      <Typography variant="caption" fontWeight={600} sx={{ fontSize: 11 }}>{value}</Typography>
    </Box>
  );
}
