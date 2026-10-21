// Usage: npm run seed
// Creates a demo account and a handful of sample posts. Safe to run more than once:
// posts that already exist (same author + title) are skipped.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Blog = require('../models/Blog');
const { DEMO_USER, POSTS } = require('./seed-data');

const DAY = 24 * 60 * 60 * 1000;

(async () => {
  await connectDB();

  let user = await User.findOne({ email: DEMO_USER.email });
  if (!user) user = await User.create(DEMO_USER);

  let added = 0;
  for (const p of POSTS) {
    if (await Blog.exists({ author: user._id, title: p.title })) continue;
    await Blog.create({
      title: p.title,
      content: p.content,
      category: p.category,
      author: user._id,
      createdAt: new Date(Date.now() - p.daysAgo * DAY),
    });
    added++;
  }

  console.log(`Seed complete: ${added} new post(s) added.`);
  console.log(`Demo login: ${DEMO_USER.email} / ${DEMO_USER.password}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
