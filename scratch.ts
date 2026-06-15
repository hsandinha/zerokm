import mongoose from 'mongoose';
import connectDB from './lib/mongodb';
import User from './models/User';

async function run() {
    await connectDB();
    const users = await User.find({ allowedProfiles: 'cliente' }).limit(5).lean();
    console.log(JSON.stringify(users, null, 2));
    process.exit(0);
}
run();
