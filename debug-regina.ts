import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import mongoose from 'mongoose';
import User from './models/User';

async function main() {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const regina = await User.findById('6a14508df0314faba853e927').lean();
    console.log("Regina user data:", regina);
    process.exit(0);
}
main().catch(console.error);
