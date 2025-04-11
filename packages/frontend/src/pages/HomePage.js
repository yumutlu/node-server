import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  TextField,
  Chip,
  Divider,
  IconButton,
  Collapse,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Drawer,
  AppBar,
  Toolbar
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import { getEmails, replyToEmail, triggerAnalysis } from '../services/api';

const sentimentColors = {
  positive: '#4caf50',
  negative: '#f44336',
  neutral: '#9e9e9e'
};

const sentimentLabels = {
  positive: 'Positive',
  negative: 'Negative',
  neutral: 'Neutral'
};

const categoryLabels = {
  complaint: 'Complaint',
  suggestion: 'Suggestion',
  inquiry: 'Inquiry',
  compliment: 'Thank You',
  other: 'Other'
};

const HomePage = () => {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [selectedSentiment, setSelectedSentiment] = useState('');
  const [expandedEmail, setExpandedEmail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getEmails(selectedLabel, selectedSentiment);
      setEmails(data);
      setLastUpdate(new Date());
    } catch (err) {
      setError('An error occurred while loading emails.');
      console.error('Error fetching emails:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedLabel, selectedSentiment]);

  useEffect(() => {
    fetchEmails();
    const interval = setInterval(fetchEmails, 30000);
    return () => clearInterval(interval);
  }, [fetchEmails]);

  const handleReply = async (emailId) => {
    if (!emailId || !replyContent) return;
    
    try {
      setLoading(true);
      setError(null);
      await replyToEmail(emailId, replyContent);
      
      // Başarılı yanıt
      setReplyContent('');
      setSelectedEmail(null);
      await fetchEmails(); // Listeyi güncelle
      
    } catch (err) {
      setError(err.message || 'An error occurred while sending the email.');
      console.error('Reply error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLabelClick = (label) => {
    setSelectedLabel(label === selectedLabel ? null : label);
  };

  const handleSentimentChange = (event) => {
    setSelectedSentiment(event.target.value);
  };

  const toggleEmailExpand = (emailId) => {
    setExpandedEmail(expandedEmail === emailId ? null : emailId);
  };

  const uniqueLabels = [...new Set(emails.flatMap(email => email.labels))].filter(Boolean);

  return (
    <Container maxWidth="xl">
      <Box sx={{ my: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Filters</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Refresh">
                    <IconButton onClick={fetchEmails} size="small">
                      <RefreshIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Sentiment</InputLabel>
                <Select
                  value={selectedSentiment}
                  onChange={handleSentimentChange}
                  label="Sentiment"
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="positive">Positive</MenuItem>
                  <MenuItem value="negative">Negative</MenuItem>
                  <MenuItem value="neutral">Neutral</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="subtitle1" gutterBottom>
                Labels
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {uniqueLabels.map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    onClick={() => handleLabelClick(label)}
                    variant={selectedLabel === label ? 'filled' : 'outlined'}
                    color={selectedLabel === label ? 'primary' : 'default'}
                  />
                ))}
              </Box>
            </Paper>

            {lastUpdate && (
              <Typography variant="caption" color="text.secondary">
                Last update: {lastUpdate.toLocaleTimeString()}
              </Typography>
            )}
          </Grid>

          <Grid item xs={12} md={9}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Emails {selectedLabel && `- ${selectedLabel}`} {selectedSentiment && `- ${sentimentLabels[selectedSentiment]}`}
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : emails.length === 0 ? (
                <Typography variant="body1" sx={{ p: 2, textAlign: 'center' }}>
                  No emails found
                </Typography>
              ) : (
                <List>
                  {emails.map((email) => (
                    <React.Fragment key={email._id}>
                      <ListItem
                        sx={{
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          cursor: 'pointer',
                          bgcolor: selectedEmail?._id === email._id ? 'action.selected' : 'inherit'
                        }}
                      >
                        <Box sx={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle1" fontWeight="bold">{email.subject || 'No Subject'}</Typography>
                                {email.sentiment && (
                                  <Chip
                                    label={sentimentLabels[email.sentiment] || email.sentiment}
                                    size="small"
                                    sx={{
                                      bgcolor: sentimentColors[email.sentiment] || '#9e9e9e',
                                      color: 'white'
                                    }}
                                  />
                                )}
                              </Box>
                            }
                            secondary={
                              <Typography variant="body2" color="text.secondary">
                                {email.from || 'Unknown Sender'} - {new Date(email.timestamp).toLocaleString()}
                              </Typography>
                            }
                          />
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {email.isAnswered && (
                              <Chip label="Replied" color="success" size="small" />
                            )}
                            {email.category && (
                              <Chip 
                                label={categoryLabels[email.category] || email.category} 
                                variant="outlined" 
                                size="small"
                                color={email.category === 'complaint' ? 'error' : 
                                       email.category === 'compliment' ? 'success' : 
                                       email.category === 'suggestion' ? 'info' : 
                                       'default'} 
                              />
                            )}
                            <IconButton size="small" onClick={() => toggleEmailExpand(email._id)}>
                              {expandedEmail === email._id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                          </Box>
                        </Box>
                        
                        <Collapse in={expandedEmail === email._id} timeout="auto" unmountOnExit>
                          <Box sx={{ px: 2, pb: 2 }}>
                            <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
                              {email.content}
                            </Typography>
                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                              <Button
                                variant="contained"
                                color="primary"
                                onClick={() => setSelectedEmail(email)}
                                disabled={email.isAnswered}
                              >
                                {email.isAnswered ? 'Replied' : 'Reply'}
                              </Button>
                            </Box>
                          </Box>
                        </Collapse>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                </List>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Box>

      <Drawer
        anchor="right"
        open={Boolean(selectedEmail)}
        onClose={() => {
          setSelectedEmail(null);
          setReplyContent('');
        }}
        sx={{
          '& .MuiDrawer-paper': {
            width: '40%',
            minWidth: '300px',
            maxWidth: '600px',
          },
        }}
      >
        {selectedEmail && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Toolbar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" component="div">
                    {selectedEmail.subject}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedEmail.from}
                  </Typography>
                </Box>
                <IconButton 
                  edge="end" 
                  onClick={() => {
                    setSelectedEmail(null);
                    setReplyContent('');
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </Toolbar>
            </AppBar>

            <Box sx={{ p: 2, bgcolor: 'grey.50', flex: '0 0 auto' }}>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
                {selectedEmail.content}
              </Typography>
            </Box>

            <Box sx={{ 
              p: 2, 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column',
              gap: 2,
              bgcolor: 'background.paper'
            }}>
              <TextField
                fullWidth
                multiline
                rows={8}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Reply content here..."
                variant="outlined"
                disabled={loading}
                sx={{ flex: 1 }}
              />
              
              {error && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {error}
                </Alert>
              )}

              <Box sx={{ 
                display: 'flex', 
                gap: 2, 
                borderTop: 1, 
                borderColor: 'divider',
                pt: 2,
                mt: 'auto'
              }}>
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  onClick={() => handleReply(selectedEmail._id)}
                  disabled={!replyContent || loading}
                >
                  {loading ? <CircularProgress size={24} /> : 'Send Reply'}
                </Button>
              </Box>
            </Box>
          </Box>
        )}
      </Drawer>
    </Container>
  );
};

export default HomePage; 