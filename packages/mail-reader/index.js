require('dotenv').config({ path: '../../.env' });
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const mongoose = require('mongoose');
const Email = require('./models/Email');
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

let imap = null;

function createImapConnection() {
  try {
    imap = new Imap({
      user: process.env.GMAIL_USER,
      password: process.env.GMAIL_APP_PASSWORD,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { 
        rejectUnauthorized: false,
        enableTrace: true
      },
      keepalive: {
        interval: 10000,
        idleTimeout: 300000
      },
      authTimeout: 30000,
      connTimeout: 60000,
      debug: console.log
    });

    imap.once('ready', function() {
      console.log('IMAP connection is ready');
      setTimeout(() => {
        checkNewEmails().catch(err => {
          console.error('Error during initial mail check:', err);
        });
      }, 2000);
    });

    imap.once('error', function(err) {
      console.log('IMAP Connection Error:', err);
      setTimeout(reconnect, 10000);
    });

    imap.once('end', function() {
      console.log('IMAP Connection Terminated');
      setTimeout(reconnect, 10000);
    });

    return imap;
  } catch (error) {
    console.error('Error creating IMAP connection:', error);
    setTimeout(reconnect, 10000);
    return null;
  }
}

function reconnect() {
  console.log('Re-establishing IMAP connection...');
  try {
    if (imap) {
      imap.removeAllListeners();
      imap.destroy();
    }
    imap = createImapConnection();
    if (imap) {
      imap.connect();
    }
  } catch (error) {
    console.error('Reconnection error:', error);
    setTimeout(reconnect, 15000);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

mongoose.connect(process.env.MONGODB_URI);

function openInbox(cb) {
  if (!imap || imap.state !== 'authenticated') {
    console.log('IMAP not authenticated, reconnecting...');
    reconnect();
    cb(new Error('Not authenticated'));
    return;
  }
  imap.openBox('INBOX', true, cb);
}

async function saveEmail(mail) {
  try {
    console.log('Raw email data:', {
      subject: mail.subject,
      from: mail.from,
      date: mail.date,
      hasText: !!mail.text,
      hasHtml: !!mail.html
    });

    // E-posta başlıklarını kontrol et
    const headers = mail.headers || {};
    const subject = mail.subject || headers.get('subject') || 'No Subject';
    
    // Gönderen alanını düzgün şekilde çıkar
    let from = 'Unknown Sender';
    if (mail.from) {
      if (typeof mail.from === 'string') {
        from = mail.from;
      } else if (mail.from.text) {
        from = mail.from.text;
      } else if (mail.from.value && Array.isArray(mail.from.value) && mail.from.value.length > 0) {
        if (mail.from.value[0].name) {
          from = mail.from.value[0].name;
        } else if (mail.from.value[0].address) {
          from = mail.from.value[0].address;
        }
      }
    } else if (headers.get('from')) {
      from = headers.get('from');
    }
    
    const content = mail.text || (mail.html ? mail.html.toString() : 'No Content');

    // HTML içeriğini temizle
    let cleanContent = content;
    if (cleanContent.includes('<div') || cleanContent.includes('<p')) {
      cleanContent = cleanContent.replace(/<[^>]*>/g, '');
      cleanContent = cleanContent.replace(/\n\s*\n/g, '\n');
      cleanContent = cleanContent.trim();
    }

    const emailData = {
      subject: subject.trim(),
      from: from.trim(),
      content: cleanContent,
      timestamp: mail.date || new Date(),
      labels: [],
      isAnalyzed: false
    };

    console.log('Processed email data:', emailData);

    // Aynı e-postayı kontrol et
    const existingEmail = await Email.findOne({
      subject: emailData.subject,
      from: emailData.from,
      content: emailData.content,
      timestamp: {
        $gte: new Date(emailData.timestamp.getTime() - 60000),
        $lte: new Date(emailData.timestamp.getTime() + 60000)
      }
    });

    if (existingEmail) {
      console.log('Email already exists:', emailData.subject);
      return null;
    }

    const email = new Email(emailData);
    await email.save();
    console.log('New email saved:', email.subject);

    // E-posta kaydedildikten sonra analiz işlemini başlat
    try {
      await analyzeEmail(email);
    } catch (analyzeError) {
      console.error('Error analyzing email:', analyzeError);
    }

    return email;
  } catch (error) {
    console.error('Error saving email:', error);
    return null;
  }
}

async function analyzeEmail(email) {
  try {
    // OpenAI analizi için gerekli verileri hazırla
    const emailContent = {
      subject: email.subject,
      from: email.from,
      content: email.content
    };

    // OpenAI API'sini çağır ve analiz yap
    const analysis = await analyzeWithOpenAI(emailContent);

    // Analiz sonuçlarını e-postaya kaydet
    email.sentiment = analysis.sentiment;
    email.category = analysis.category;
    email.labels = analysis.labels;
    email.isAnalyzed = true;

    await email.save();
    console.log('Email analyzed and updated:', email.subject);
  } catch (error) {
    console.error('Error in analyzeEmail:', error);
    throw error;
  }
}

async function checkNewEmails() {
  try {
    console.log('checkNewEmails called', new Date().toISOString());
    
    return new Promise((resolve, reject) => {
      if (!imap || imap.state !== 'authenticated') {
        console.log('IMAP not ready, skipping check. IMAP durumu:', imap ? imap.state : 'null');
        resolve();
        return;
      }

      openInbox(async function(err, box) {
        if (err) {
          console.log('Error opening inbox:', err);
          resolve();
          return;
        }

        try {
          const fiveMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
          const searchCriteria = [
            'ALL',
            ['SINCE', fiveMinutesAgo.toISOString()]
          ];

          const results = await new Promise((searchResolve, searchReject) => {
            imap.search(searchCriteria, (err, results) => {
              if (err) searchReject(err);
              else searchResolve(results);
            });
          });

          if (!results || !results.length) {
            console.log('No new messages found');
            resolve();
            return;
          }

          // Mailleri daha küçük gruplara böl
          const chunkSize = 5;
          const chunks = [];
          for (let i = 0; i < results.length; i += chunkSize) {
            chunks.push(results.slice(i, i + chunkSize));
          }

          // Her grubu sırayla işle
          for (const chunk of chunks) {
            await processEmailChunk(chunk, imap);
          }

          resolve();
        } catch (error) {
          console.error('Error in mail processing:', error);
          resolve();
        }
      });
    });
  } catch (error) {
    console.error('Error in checkNewEmails:', error);
  }
}

async function processEmailChunk(messageIds, imap) {
  return new Promise((resolve, reject) => {
    const f = imap.fetch(messageIds, {
      bodies: ['HEADER', 'TEXT'],
      markSeen: false,
      struct: true
    });

    let processedCount = 0;
    const totalCount = messageIds.length;

    f.on('message', function(msg) {
      let emailData = {};

      msg.on('error', function(err) {
        console.error('Message error:', err);
      });

      msg.on('body', async function(stream, info) {
        if (info.which === 'HEADER') {
          try {
            const parsed = await simpleParser(stream);
            emailData.subject = parsed.subject || 'No Subject';
            
            // Gönderen bilgisini doğru şekilde çıkar
            let from = 'Unknown Sender';
            if (parsed.from) {
              if (typeof parsed.from === 'string') {
                from = parsed.from;
              } else if (parsed.from.text) {
                from = parsed.from.text;
              } else if (parsed.from.value && Array.isArray(parsed.from.value) && parsed.from.value.length > 0) {
                if (parsed.from.value[0].name) {
                  from = parsed.from.value[0].name;
                } else if (parsed.from.value[0].address) {
                  from = parsed.from.value[0].address;
                }
              }
            }
            emailData.from = from;
            
            emailData.date = parsed.date || new Date();
            
            // Başlık kısmından da içerik alabiliriz
            if (parsed.text) {
              emailData.headerText = parsed.text;
            }
            if (parsed.html) {
              emailData.headerHtml = parsed.html;
            }
            
            console.log('Header parsing completed:', { 
              subject: emailData.subject, 
              from: emailData.from, 
              hasHeaderText: !!emailData.headerText,
              hasHeaderHtml: !!emailData.headerHtml 
            });
          } catch (headerError) {
            console.error('Error parsing header:', headerError);
          }
        }
        
        if (info.which === 'TEXT') {
          try {
            const parsed = await simpleParser(stream);
            
            // İçerik öncelik sırası: text -> html -> headerText -> headerHtml -> No Content
            let content = '';
            
            if (parsed.text && parsed.text.trim().length > 0) {
              content = parsed.text;
            } else if (parsed.html && parsed.html.trim().length > 0) {
              content = parsed.html;
            }

            // MIME sınırlarını ve header bilgilerini temizle
            content = content
              // MIME sınırlarını temizle
              .replace(/--[a-zA-Z0-9]+(?:-{2})?/g, '')
              // Content-Type satırlarını temizle
              .replace(/Content-Type:.*?\n/g, '')
              // Content-Transfer-Encoding satırlarını temizle
              .replace(/Content-Transfer-Encoding:.*?\n/g, '')
              // Charset bilgilerini temizle
              .replace(/charset=.*?\n/g, '')
              // Boş satırları temizle
              .replace(/\n\s*\n/g, '\n')
              // Baştaki ve sondaki boşlukları temizle
              .trim();

            // HTML içeriğini temizle
            if (content.includes('<div') || content.includes('<p') || content.includes('<html')) {
              content = content
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            }

            emailData.content = content;
            console.log('Cleaned content:', content);
          } catch (textError) {
            console.error('Content parsing error:', textError);
            emailData.content = 'Mail içeriği alınamadı';
          }
        }
      });

      msg.once('end', async function() {
        try {
          console.log('Processing email with subject:', emailData.subject, 'from:', emailData.from);

          // Kritik alanların kontrolü
          if (!emailData.subject) emailData.subject = 'No Subject';
          if (!emailData.from) emailData.from = 'Unknown Sender';
          
          // Içerik kontrol ve temizleme
          if (!emailData.content || emailData.content === 'No Content') {
            if (emailData.headerText) {
              emailData.content = emailData.headerText;
            } else if (emailData.headerHtml) {
              emailData.content = emailData.headerHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            } else {
              emailData.content = 'Mail içeriği alınamadı';
            }
          }
          
          // İçerikte e-posta başlıkları varsa temizle
          if (emailData.content && emailData.content.includes('Content-Type:')) {
            const contentParts = emailData.content.split('--');
            if (contentParts.length > 1) {
              // İlk anlamlı içeriği al
              for (const part of contentParts) {
                if (part.length > 30 && !part.includes('Content-Type:')) {
                  emailData.content = part.trim();
                  break;
                }
              }
            }
          }

          // Aynı içeriğe sahip mail var mı kontrol et
          const existingEmail = await Email.findOne({
            content: emailData.content,
            subject: emailData.subject,
            from: emailData.from
          });

          if (existingEmail) {
            console.log('Email already exists:', emailData.subject);
          } else {
            // Yeni e-postayı kaydet
            const email = new Email({
              subject: emailData.subject,
              from: emailData.from,
              content: emailData.content,
              timestamp: emailData.date || new Date(),
              labels: [],
              isAnalyzed: false
            });

            try {
              await email.save();
              console.log('New email saved successfully:', {
                id: email._id,
                subject: email.subject,
                from: email.from,
                timestamp: email.timestamp,
                contentLength: email.content.length
              });
            } catch (saveError) {
              console.error('Error saving email to database:', saveError);
              
              // Kayıt hatası "required" ile ilgiliyse
              if (saveError.name === 'ValidationError') {
                // Eksik alanları tamamla ve yeniden dene
                const fixedEmail = new Email({
                  subject: emailData.subject || 'No Subject',
                  from: emailData.from || 'Unknown Sender',
                  content: emailData.content || 'Mail içeriği alınamadı',
                  timestamp: emailData.date || new Date(),
                  labels: [],
                  isAnalyzed: false
                });
                
                try {
                  await fixedEmail.save();
                  console.log('Fixed email saved after validation error:', {
                    id: fixedEmail._id,
                    subject: fixedEmail.subject
                  });
                } catch (retryError) {
                  console.error('Still failed to save email after fixing fields:', retryError);
                }
              }
            }
          }

          processedCount++;
          if (processedCount === totalCount) {
            console.log('All messages processed');
            resolve();
          }
        } catch (error) {
          console.error('Error processing email:', error);
          processedCount++;
          if (processedCount === totalCount) {
            resolve();
          }
        }
      });
    });
  });
}

async function startEmailCheck() {
  while (true) {
    try {
      await checkNewEmails();
    } catch (error) {
      console.error('Error in email check cycle:', error);
    }
    // 1 dakika bekle
    await new Promise(resolve => setTimeout(resolve, 60000));
  }
}

// API endpoints
app.get('/api/check-emails', async (req, res) => {
  try {
    console.log('Manuel e-posta kontrolü tetiklendi');
    const result = await checkNewEmails();
    res.json({ success: true, message: 'E-posta kontrolü tamamlandı' });
  } catch (error) {
    console.error('Manuel e-posta kontrolü hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/emails', async (req, res) => {
  try {
    const { label, sentiment } = req.query;
    const baseQuery = { isAnalyzed: true }; // Sadece analiz edilmiş e-postaları getir
    
    if (label) {
      baseQuery.labels = { $in: [label] };
    }

    if (sentiment) {
      baseQuery.sentiment = sentiment;
    }
    
    const emails = await Email.find(baseQuery)
      .sort({ timestamp: -1 })
      .select('subject from content timestamp labels isAnswered sentiment category');
    
    res.json(emails);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/emails/:id/reply', async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    // E-postayı bul
    const email = await Email.findById(id);
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Mail gönderme ayarları
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email.from,
      subject: `Re: ${email.subject}`,
      text: content
    };

    // Maili gönder
    await transporter.sendMail(mailOptions);

    // E-postayı yanıtlandı olarak işaretle
    email.isAnswered = true;
    await email.save();

    res.json({ success: true, message: 'Reply sent successfully' });
  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ error: 'Error sending reply' });
  }
});

app.get('/api/trigger-analysis', async (req, res) => {
  try {
    console.log('Manuel mail analiz işlemi tetiklendi');
    
    // Mail analiz uygulamasını çalıştırarak analiz işlemini başlat
    const { exec } = require('child_process');
    exec('cd ../mail-analyzer && node index.js', (error, stdout, stderr) => {
      if (error) {
        console.error(`Mail analiz uygulaması çalıştırma hatası: ${error}`);
      }
      console.log(`Mail analiz çıktısı: ${stdout}`);
      if (stderr) {
        console.error(`Mail analiz hata çıktısı: ${stderr}`);
      }
    });
    
    res.json({ success: true, message: 'Mail analiz işlemi başlatıldı' });
  } catch (error) {
    console.error('Mail analiz tetikleme hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/imap-status', (req, res) => {
  try {
    console.log('IMAP durumu endpoint\'i çağrıldı');
    const status = {
      connected: imap && imap.state === 'authenticated',
      state: imap ? imap.state : 'null',
      lastCheck: new Date().toISOString()
    };
    console.log('IMAP durumu:', status);
    res.json(status);
  } catch (error) {
    console.error('IMAP durum kontrolü hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

// İlk bağlantıyı kur
imap = createImapConnection();
console.log('IMAP bağlantısı oluşturuldu, kullanıcı:', process.env.GMAIL_USER);

// Bağlantıyı başlat
imap.connect();
console.log('IMAP bağlantısı başlatıldı');

// Mail kontrolünü başlat
startEmailCheck();
console.log('E-posta kontrol döngüsü başlatıldı');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/emails`);
});

module.exports = {
  checkNewEmails
}; 