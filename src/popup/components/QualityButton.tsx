import React, { useState } from 'react';
import {
  Button, Menu, MenuItem, ListItemIcon, ListItemText,
  Typography, Box, Tooltip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StorageIcon from '@mui/icons-material/Storage';
import LinkIcon from '@mui/icons-material/Link';
import type { VideoStream, DownloadMethod } from '../../types';
import { formatBytes } from '../../utils/helpers';

interface Props {
  stream: VideoStream;
  onDownload: (method: DownloadMethod) => void;
}

const QUALITY_COLORS: Record<string, string> = {
  '2160p': '#FFD700',
  '1440p': '#FF6B35',
  '1080p': '#6750A4',
  '720p': '#2196F3',
  '480p': '#4CAF50',
  '360p': '#9E9E9E',
  '240p': '#9E9E9E',
  '144p': '#9E9E9E',
  'best': '#6750A4',
  'audio': '#FF5722',
};

export function QualityButton({ stream, onDownload }: Props) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const open = Boolean(anchor);

  const color = QUALITY_COLORS[stream.quality] || '#6750A4';
  const label = stream.label || stream.quality;
  const sizeLabel = stream.fileSize ? formatBytes(stream.fileSize) : '';
  const formatLabel = stream.format.toUpperCase();

  return (
    <>
      <Tooltip
        title={
          <Box>
            <div>{label}</div>
            {stream.width && <div>{stream.width}×{stream.height}</div>}
            {stream.fps && <div>{stream.fps} fps</div>}
            {sizeLabel && <div>~{sizeLabel}</div>}
            {stream.requiresMerge && <div style={{ color: '#FFD700' }}>⚡ Requires merging (backend)</div>}
          </Box>
        }
      >
        <Button
          size="small"
          variant="outlined"
          endIcon={<ArrowDropDownIcon sx={{ fontSize: '14px !important', ml: -0.5 }} />}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{
            fontSize: 11,
            height: 28,
            borderRadius: 2,
            borderColor: color + '66',
            color: color,
            fontWeight: 600,
            '&:hover': { borderColor: color, bgcolor: color + '11' },
          }}
        >
          {label}
          {sizeLabel && <Typography component="span" sx={{ fontSize: 10, ml: 0.5, opacity: 0.75 }}>·{sizeLabel}</Typography>}
        </Button>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 200 } }}
      >
        <MenuItem dense disabled sx={{ opacity: '1 !important' }}>
          <ListItemText
            primary={`${label} · ${formatLabel}`}
            secondary={[stream.width && `${stream.width}×${stream.height}`, sizeLabel && `~${sizeLabel}`, stream.fps && `${stream.fps}fps`].filter(Boolean).join(' · ')}
            primaryTypographyProps={{ fontSize: 12, fontWeight: 600 }}
            secondaryTypographyProps={{ fontSize: 11 }}
          />
        </MenuItem>

        <MenuItem dense onClick={() => { setAnchor(null); onDownload('browser'); }}>
          <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Browser Download" secondary="Built-in downloader" primaryTypographyProps={{ fontSize: 12 }} secondaryTypographyProps={{ fontSize: 11 }} />
        </MenuItem>

        <MenuItem dense onClick={() => { setAnchor(null); onDownload('backend'); }}>
          <ListItemIcon><StorageIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Backend Download" secondary="Via HF backend + FFmpeg" primaryTypographyProps={{ fontSize: 12 }} secondaryTypographyProps={{ fontSize: 11 }} />
        </MenuItem>

        <MenuItem dense onClick={() => { setAnchor(null); onDownload('fdm'); }}>
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="FDM" secondary="Free Download Manager" primaryTypographyProps={{ fontSize: 12 }} secondaryTypographyProps={{ fontSize: 11 }} />
        </MenuItem>

        <MenuItem dense onClick={() => { setAnchor(null); onDownload('idm'); }}>
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="IDM" secondary="Internet Download Manager" primaryTypographyProps={{ fontSize: 12 }} secondaryTypographyProps={{ fontSize: 11 }} />
        </MenuItem>

        <MenuItem dense onClick={() => { setAnchor(null); onDownload('jdownloader'); }}>
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="JDownloader 2" primaryTypographyProps={{ fontSize: 12 }} />
        </MenuItem>

        <MenuItem dense onClick={() => { setAnchor(null); onDownload('aria2'); }}>
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="aria2 / Motrix" primaryTypographyProps={{ fontSize: 12 }} />
        </MenuItem>

        <MenuItem dense onClick={() => { setAnchor(null); navigator.clipboard.writeText(stream.url); }}>
          <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Copy URL" primaryTypographyProps={{ fontSize: 12 }} />
        </MenuItem>
      </Menu>
    </>
  );
}
