import React from 'react';
import { Box, Typography } from '@mui/material';
import type { DetectedVideo } from '../../types';
import { VideoCard } from './VideoCard';

interface Props {
  videos: DetectedVideo[];
  activeVideo: DetectedVideo | null;
}

export function VideoList({ videos, activeVideo }: Props) {
  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {videos.map(video => (
        <VideoCard
          key={video.id}
          video={video}
          isActive={activeVideo?.id === video.id}
        />
      ))}
    </Box>
  );
}
