require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');
const OpenAI = require('openai');
const Email = require('../mail-reader/models/Email');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

mongoose.connect(process.env.MONGODB_URI);

let isProcessing = false;

async function isEmailAnalyzed(email) {
  return (
    email.sentiment &&
    email.category &&
    email.labels &&
    Array.isArray(email.labels) &&
    email.labels.length > 0
  );
}

async function analyzeEmail(email) {
  try {
    const prompt = `Analyze this email and provide:
1. Sentiment (positive/negative/neutral)
2. Category (complaint/suggestion/inquiry/other)
3. Key topics (as labels, maximum 3 labels, in English)

Email subject: ${email.subject}
Email content:
${email.content}

Respond in JSON format with these fields: sentiment, category, labels`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-3.5-turbo",
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    console.log('Analysis result for email:', email.subject, analysis);
    return analysis;
  } catch (error) {
    console.error('Error in analyzeEmail:', error);
    throw error;
  }
}

async function processEmails() {
  try {
    console.log('Starting email analysis process...');
    
    while (true) {
      if (isProcessing) {
        console.log('Another analysis process is running, waiting...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        continue;
      }

      isProcessing = true;

      try {
        // Find only unanalyzed emails with unique content
        const unanalyzedEmails = await Email.aggregate([
          {
            $match: {
              isAnalyzed: false,
              content: { $ne: null, $ne: '', $ne: 'No Content' }
            }
          },
          {
            // Group by content
            $group: {
              _id: "$content",
              firstEmail: { $first: "$$ROOT" }
            }
          },
          {
            // Restore original document structure
            $replaceRoot: { newRoot: "$firstEmail" }
          },
          {
            $sort: { timestamp: -1 }
          },
          {
            $limit: 10
          }
        ]);
        
        const emailCount = unanalyzedEmails.length;
        if (emailCount === 0) {
          console.log('No new emails to analyze. Waiting for 1 minute...');
          await new Promise(resolve => setTimeout(resolve, 60000));
          isProcessing = false;
          continue;
        }
        
        console.log(`Found ${emailCount} unanalyzed unique emails`);

        for (const emailDoc of unanalyzedEmails) {
          try {
            // Convert MongoDB document to Mongoose model
            const email = await Email.findById(emailDoc._id);
            if (!email) {
              console.log('Email not found:', emailDoc._id);
              continue;
            }

            // First find other copies by content
            const duplicates = await Email.find({
              content: email.content,
              _id: { $ne: email._id },
              isAnalyzed: false
            });

            console.log('Analyzing email:', email.subject);
            const analysis = await analyzeEmail(email);
            
            if (analysis && analysis.labels && analysis.labels.length > 0) {
              // Update main email
              email.sentiment = analysis.sentiment;
              email.category = analysis.category;
              email.labels = analysis.labels;
              email.isAnalyzed = true;
              await email.save();

              // Update copies if any
              if (duplicates.length > 0) {
                console.log(`Updating ${duplicates.length} duplicate emails with same content`);
                await Email.updateMany(
                  { _id: { $in: duplicates.map(d => d._id) } },
                  {
                    $set: {
                      sentiment: analysis.sentiment,
                      category: analysis.category,
                      labels: analysis.labels,
                      isAnalyzed: true
                    }
                  }
                );
              }

              console.log(`Successfully analyzed and updated email and its ${duplicates.length} duplicates:`, email.subject);
            } else {
              console.log(`Skipping email due to invalid analysis result: ${email.subject}`);
            }
          } catch (error) {
            console.error(`Error analyzing email ${emailDoc.subject}:`, error);
            continue;
          }
        }

        console.log('Analysis batch completed. Waiting for 1 minute before next check...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      } finally {
        isProcessing = false;
      }
    }
  } catch (error) {
    console.error('Error in processEmails:', error);
    isProcessing = false;
    throw error;
  }
}

// Start analysis process when MongoDB connection is successful
mongoose.connection.once('open', () => {
  console.log('Connected to MongoDB');
  processEmails().catch(error => {
    console.error('Fatal error in processEmails:', error);
    process.exit(1);
  });
});

// Catch MongoDB connection errors
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
}); 