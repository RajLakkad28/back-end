// Database/model/event.js
const mongoose = require('mongoose');
const { isNumber } = require('razorpay/dist/utils/razorpay-utils');
const Schema = mongoose.Schema;

const eventSchema = new Schema({
    title: String,
    date: Date,
    location: String,
    description: String,
    price:Number,
    image: String
  });

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
