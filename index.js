const TelegramBot = require('node-telegram-bot-api');
var FeedParser = require('feedparser');
var request = require('request'); // for fetching the feed
var htmlToText = require('html-to-text');
var AsyncPolling = require('async-polling');
var mongoose = require('mongoose');

let pollingTime = 10000
let startPollingDelay = 30000

mongoose.connect('mongodb://localhost/t22');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
    console.log('db connect')
});

var userSchema = mongoose.Schema({
    chatId: Number,
    subscription: Number
});

var userModel = mongoose.model('userModel', userSchema)

var feedSchema = mongoose.Schema({
    link: String,
    posts: [String],
    users: [{type: mongoose.Schema.Types.ObjectId, ref: 'userModel'}]
})

var feedModel = mongoose.model('feedModel', feedSchema)

feedModel.find({}, function (err, result) {
    result.forEach(function (item) {
        createPolling(item, pollingTime)
    })
    console.log('feeds: ', result)
})

userModel.find({}, function (err, result) {
    console.log('users: ', result)
})




// replace the value below with the Telegram token you receive from @BotFather
const token = '330066489:AAG1eTsaceto4eUrsKoE1TUngTX3UV17j8k';

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});
var feed = []
let id = 0

bot.on('message', (msg) => {
    if(msg.text == "/addfeed") {
        return
    }
    const chatId = msg.chat.id;
    if(msg.text == "/start") {
        userModel.find({chatId: chatId}, function (err, user) {
            if(err) {
                console.log('err')
                return
            }
            console.log(user)
            if(user.length == 0) {
                createNewUser(chatId)
            } else {
                bot.sendMessage(chatId, 'شما قبلا ثبت نام کرده‌اید!')
            }
        })
    } else if(msg.text.slice(0, 8) == '/addfeed') {
        var site = msg.text.slice(9, msg.text.length)
        site = site.replace(/\s/g, '')
        var prefix = 'http://';
        if (site.substr(0, prefix.length) !== prefix)
        {
            site = prefix + site;
        }
        var chatUser
        userModel.find({chatId: chatId}, function (err, user) {
            if(user.length == 0) {
                chatUser = createNewUser(chatId)
            } else {
                chatUser = user[0]
            }
            feedModel.find({link: site}, function (err, feed) {
                if(feed.length == 0) {
                    var posts = []
                    var siteFeed = new feedModel({link: site, posts: posts, users: [chatUser._id]})
                    updatePostLinks(siteFeed)
                    setTimeout(function () {
                        siteFeed.save(function (err) {
                            if(err) {
                                console.log('site feed err: '+ siteFeed)
                            } else {
                                console.log('site feed saved: '+ siteFeed)
                            }
                        })
                        console.log('start Poling')
                        createPolling(siteFeed, pollingTime)
                    }, startPollingDelay);

                } else {
                    feed[0].users.push(chatUser._id)
                    feed[0].save()
                }
            })
        })
    }
})

function createNewUser(chatId) {
    bot.sendMessage(chatId, 'به ربات خبرخوان خوش آمدی خر!')
    var newUser = new userModel({chatId: chatId, subscription: 0})
    newUser.save(function (err) {
        if(err) {
            console.log(err)
        } else {
            console.log('new user saved')
        }
    })
    console.log(newUser)
    return newUser
}

function updatePostLinks(feed) {
    req = request(feed.link)

    var feedparser = new FeedParser([]);

    req.on('error', function (error) {
        //bot.sendMessage(id, 'error on request')
    });

    req.on('response', function (res) {
        var stream = this; // `this` is `req`, which is a stream

        if (res.statusCode !== 200) {
            bot.sendMessage(index, 'err')
        }
        else {
            stream.pipe(feedparser);
        }
    })
    feedparser.on('error', function (error) {
        bot.sendMessage('feedparser err')
        // always handle errors
    });

    feedparser.on('readable', function () {
        var stream = this; // `this` is `feedparser`, which is a stream
        var meta = this.meta; // **NOTE** the "meta" is always available in the context of the feedparser instance
        var item;

        while (item = stream.read()) {
            feed.posts.push(item.link)
        }
        feed.save()
    })
}

function createPolling(feed, delay) {
    var polling = AsyncPolling(function (end) {
        req = request(feed.link)
        var feedparser = new FeedParser([]);
        req.on('error', function (error) {
            end('error on request')
            //bot.sendMessage(id, 'error on request')
        });

        req.on('response', function (res) {
            var stream = this; // `this` is `req`, which is a stream

            if (res.statusCode !== 200) {
                console.log('err'+str(new Error('Bad status code')))
            }
            else {
                stream.pipe(feedparser);
                end(null, feedparser)
            }
        });


    }, delay);

    polling.on('error', function (error) {
        console.log('in polling err')
    });
    polling.on('result', function (result) {
        feedparser = result
        console.log('poling on')

        feedparser.on('error', function (error) {
            // always handle errors
        });

        feedparser.on('readable', function () {
            // This is where the action is!
            var stream = this; // `this` is `feedparser`, which is a stream
            var meta = this.meta; // **NOTE** the "meta" is always available in the context of the feedparser instance
            var item;

            while (item = stream.read()) {
                //bot.sendMessage(id, '10')
                var link = item.link
                if(feed.posts.find(function (e) {
                        return e == link
                    }) != undefined) {
                    continue
                }
                feed.posts.push(item.link)
                feed.save()

                var text = htmlToText.fromString(item.description, {
                    wordwrap: null
                })
                var messageNumber = Math.ceil(text.length / 4096.0)
                for(var i = 0; i < messageNumber; i++) {
                    var sendText
                    if(text.length - i*4096 < 4096) {
                        sendText = text.slice(i*4096, text.length - i*4096)
                    } else {
                        sendText = text.slice(i*4096, (i+1)*4096)
                    }
                    try {
                        if(sendText.length > 0) {
                            feedModel.findOne({_id: feed._id}).populate('users').exec(function (err, feedf) {
                                for(var i = 0; i < feedf.users.length; i++) {
                                    bot.sendMessage(feedf.users[i].chatId, sendText)
                                }
                            })
                            /*
                            feed.populate('users').exec(function (err, feed) {
                                for(var i = 0; i < feed.users.length; i++)
                                    bot.sendMessage(feed.users[i].chatId, sendText)
                            })
                            */
                        }
                    }
                    catch (error) {
                        console.log("Something went wrong: ", error);
                    }
                }
            }
        });
    });

    polling.run()
}
