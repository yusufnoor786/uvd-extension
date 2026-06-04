import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  ThemeProvider, createTheme, CssBaseline, Box, Typography,
  TextField, Switch, FormControlLabel, Button, Divider,
  Card, CardContent, Alert, Snackbar, Select, MenuItem,
  FormControl, InputLabel,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RestoreIcon from '@mui/icons-material/Restore';
import type { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

function OptionsApp() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS', timestamp: Date.now() }, (res) => {
      if (res?.settings) setSettings(res.settings);
    });
  }, []);

  const save = () => {
    chrome.runtime.sendMessage({ type: 'SET_SETTINGS', payload: settings, timestamp: Date.now() });
    setSaved(true);
  };

  const reset = () => setSettings(DEFAULT_SETTINGS);

  const theme = createTheme({
    palette: { mode: 'light', primary: { main: '#6750A4' } },
    shape: { borderRadius: 12 },
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ maxWidth: 700, mx: 'auto', p: 4 }}>
        <Typography variant="h5" fontWeight={700} mb={3}>⚙️ Ultimate Video Downloader — Settings</Typography>

        {/* Backend */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} mb={2}>Backend (Advanced)</Typography>
            <FormControlLabel
              control={<Switch checked={settings.advanced.backendEnabled}
                onChange={e => setSettings(s => ({ ...s, advanced: { ...s.advanced, backendEnabled: e.target.checked } }))} />}
              label="Enable Backend"
            />
            <TextField fullWidth size="small" label="Backend URL" sx={{ mt: 2 }}
              value={settings.advanced.backendUrl}
              onChange={e => setSettings(s => ({ ...s, advanced: { ...s.advanced, backendUrl: e.target.value } }))}
              helperText="e.g. https://zabukazuzu-uvd-backend.hf.space"
            />
            <TextField fullWidth size="small" label="API Key (optional)" sx={{ mt: 2 }}
              value={settings.advanced.backendApiKey}
              onChange={e => setSettings(s => ({ ...s, advanced: { ...s.advanced, backendApiKey: e.target.value } }))}
            />
          </CardContent>
        </Card>

        {/* Download */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} mb={2}>Download</Typography>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Default Quality</InputLabel>
              <Select value={settings.download.defaultQuality} label="Default Quality"
                onChange={e => setSettings(s => ({ ...s, download: { ...s.download, defaultQuality: e.target.value as any } }))}>
                {['best','2160p','1440p','1080p','720p','480p','360p','240p','144p'].map(q => (
                  <MenuItem key={q} value={q}>{q}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Default Method</InputLabel>
              <Select value={settings.download.defaultMethod} label="Default Method"
                onChange={e => setSettings(s => ({ ...s, download: { ...s.download, defaultMethod: e.target.value as any } }))}>
                {['browser','backend','idm','jdownloader','aria2'].map(m => (
                  <MenuItem key={m} value={m}>{m}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </CardContent>
        </Card>

        {/* UI */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} mb={2}>Interface</Typography>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Theme</InputLabel>
              <Select value={settings.ui.theme} label="Theme"
                onChange={e => setSettings(s => ({ ...s, ui: { ...s.ui, theme: e.target.value as any } }))}>
                <MenuItem value="system">System</MenuItem>
                <MenuItem value="light">Light</MenuItem>
                <MenuItem value="dark">Dark</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel control={<Switch checked={settings.ui.showThumbnails}
              onChange={e => setSettings(s => ({ ...s, ui: { ...s.ui, showThumbnails: e.target.checked } }))} />}
              label="Show Thumbnails" />
            <FormControlLabel control={<Switch checked={settings.ui.compactMode}
              onChange={e => setSettings(s => ({ ...s, ui: { ...s.ui, compactMode: e.target.checked } }))} />}
              label="Compact Mode" />
          </CardContent>
        </Card>

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={save}>Save Settings</Button>
          <Button variant="outlined" startIcon={<RestoreIcon />} onClick={reset}>Reset to Defaults</Button>
        </Box>

        <Snackbar open={saved} autoHideDuration={3000} onClose={() => setSaved(false)}>
          <Alert severity="success">Settings saved!</Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<OptionsApp />);
