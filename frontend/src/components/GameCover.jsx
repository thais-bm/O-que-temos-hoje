import { memo, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { getSteamHeaderImage } from '../utils/fbcEngine'

export const GameCover = memo(function GameCover({
  appId,
  title,
  width = '100%',
  height = '100%',
  borderRadius = 1,
}) {
  const [failedAppId, setFailedAppId] = useState(null)
  const failed = failedAppId === appId

  if (failed || !appId) {
    return (
      <Box
        sx={{
          width,
          height,
          borderRadius,
          bgcolor: '#101822',
          border: '1px solid rgba(102, 192, 244, 0.16)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 1.5,
          textAlign: 'center',
        }}
      >
        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
          APP #{appId}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'text.primary', fontWeight: 600, mt: 0.5, lineHeight: 1.2 }}
        >
          {title}
        </Typography>
      </Box>
    )
  }

  return (
    <Box
      component="img"
      src={getSteamHeaderImage(appId)}
      alt={title}
      loading="lazy"
      decoding="async"
      onError={() => setFailedAppId(appId)}
      sx={{
        width,
        height,
        objectFit: 'cover',
        display: 'block',
        borderRadius,
        bgcolor: '#101822',
      }}
    />
  )
})
