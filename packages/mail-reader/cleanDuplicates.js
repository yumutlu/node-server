require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');
const Email = require('./models/Email');

async function cleanDuplicateEmails() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const duplicates = await Email.aggregate([
      {
        $group: {
          _id: { subject: "$subject", from: "$from", timestamp: "$timestamp" },
          uniqueIds: { $addToSet: "$_id" },
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    console.log(`Found ${duplicates.length} groups of duplicate emails`);

    for (const duplicate of duplicates) {
      // Delete all except the first email
      const [keepId, ...removeIds] = duplicate.uniqueIds;
      await Email.deleteMany({ _id: { $in: removeIds } });
      console.log(`Deleted ${removeIds.length} duplicate(s) for email: ${duplicate._id.subject}`);
    }

    console.log('Cleanup completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanDuplicateEmails(); 