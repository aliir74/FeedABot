const TelegramBot = require('node-telegram-bot-api');
var FeedParser = require('feedparser');
var request = require('request'); // for fetching the feed
var htmlToText = require('html-to-text');
var AsyncPolling = require('async-polling');
var mongoose = require('mongoose');

let pollingTime = 10000
let startPollingDelay = 30000

mongoose.connect('mongodb://localhost/t28');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
    console.log('db connect')
});

var userSchema = mongoose.Schema({
    chatId: Number,
    subscription: Number,
    feeds: [{type: mongoose.Schema.Types.ObjectId, ref: 'feedModel'}]
});



var feedSchema = mongoose.Schema({
    link: String,
    posts: [String],
    users: [{type: mongoose.Schema.Types.ObjectId, ref: 'userModel'}]
})

var userModel = mongoose.model('userModel', userSchema)
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
    const chatId = msg.chat.id;
    if(msg.text == "/start") {
        userModel.find({chatId: chatId}, function (err, user) {
            if(err) {
                console.log('err')
                return
            }
            console.log(user)
            if(user.length == 0) {
                createNewUser(chatId, msg)
            } else {
                bot.sendMessage(chatId, 'شما قبلا ثبت نام کرده‌اید!')
                userModel.findOne({chatId: chatId}).populate('feeds').exec(function (err, user) {
                    var sites = ''
                    for(var i = 0; i < user.feeds.length; i++) {
                        sites = (i+1).toString() + '. ' + sites + user.feeds[i].link + '\n'
                    }
                    if(user.feeds.length == 0) {
                        bot.sendMessage(chatId, "هیچ سایتی در خبرخوان شما ثبت نشده است. برای اضافه کردن سایت پیامی مشابه زیر به ربات ارسال کنید \u{1F60A}"
                        +"\n"+"add www.example.com/rss"+"\n\n"+"\u{2757}"+" توجه کنید که حتما نسخه‌ی مخصوص خبرخوان سایت را وارد کنید نه آدرس اصلی"+"\u{2757}")
                    } else {
                        bot.sendMessage(chatId, 'تا کنون سایت‌های زیر به خبرخوان شما اضافه شده اند \u{1F60A}'
                            +'\n'+sites)
                    }
                })
            }
        })
    } else if(msg.text.slice(0, 3) == 'add') {
        var site = msg.text.slice(4, msg.text.length)
        site = site.replace(/\s/g, '')
        console.log('site', site, '10')
        var prefix = 'http://';
        if (site.substr(0, prefix.length) !== prefix)
        {
            site = prefix + site;
        }
        if(!ValidURL(site)) {
            bot.sendMessage(chatId, "'"+site+"' isnt a valid url!")
            return
        }
        if(site[site.length-1] == '/')
            site = site.slice(0, site.length-1)
        console.log('site', site, '10')
        var chatUser
        userModel.find({chatId: chatId}, function (err, user) {
            if(user.length == 0) {
                chatUser = createNewUser(chatId, msg)
            } else {
                chatUser = user[0]
            }
            feedModel.find({link: site}, function (err, feed) {
                if(feed.length == 0) {
                    var posts = []
                    var siteFeed = new feedModel({link: site, posts: posts, users: [chatUser._id]})
                    updatePostLinks(siteFeed, chatId)
                    bot.sendMessage(chatId, 'سایت '+siteFeed.link+' به خبرخوان شما اضافه شد '+'\u{1F60A}')
                    setTimeout(function () {
                        siteFeed.save(function (err) {
                            if(err) {
                                console.log('site feed err: '+ siteFeed)
                            } else {
                                console.log('site feed saved: '+ siteFeed)
                            }
                        })
                        console.log('start Poling')
                        chatUser.feeds.push(siteFeed._id)
                        chatUser.save()
                        createPolling(siteFeed, pollingTime)
                    }, startPollingDelay);

                } else {
                    feed[0].users.push(chatUser._id)
                    feed[0].save()
                    chatUser.feeds.push(feed[0]._id)
                    chatUser.save()
                }
            })
        })
    } else if(msg.text == '/help') {
        bot.sendMessage(chatId, "برای اضافه کردن سایت به خبر خوان پیامی مشابه زیر به ربات ارسال کنید \u{1F60A}"
            +"\n"+"add www.example.com/rss"+"\n\n"+"\u{2757}"+" توجه کنید که حتما نسخه‌ی مخصوص خبرخوان سایت را وارد کنید نه آدرس اصلی"+"\u{2757}")
    } else {
        bot.sendMessage(chatId, "برای اضافه کردن سایت به خبر خوان پیامی مشابه زیر به ربات ارسال کنید \u{1F60A}"
            +"\n"+"add www.example.com/rss"+"\n\n"+"\u{2757}"+" توجه کنید که حتما نسخه‌ی مخصوص خبرخوان سایت را وارد کنید نه آدرس اصلی"+"\u{2757}")
    }
})

function createNewUser(chatId, msg) {
    bot.sendMessage(chatId, msg.from.first_name+'!\n'+'به ربات خبرخوان خوش آمدی!')
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

function updatePostLinks(feed, chatId) {
    req = request(feed.link)
    if(req instanceof Error) {
        console.log('request err', err)
        return
    }
    var feedparser = new FeedParser([]);

    req.on('error', function (error) {
        //bot.sendMessage(id, 'error on request')
    });

    req.on('response', function (res) {
        var stream = this; // `this` is `req`, which is a stream

        if (res.statusCode !== 200) {
            bot.sendMessage(chatId, 'سایت شما معتبر نیست!')
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
        if(req instanceof Error) {
            console.log('request err', err)
            return
        }
        var feedparser = new FeedParser([]);
        req.on('error', function (error) {
            end('error on request')
            //bot.sendMessage(id, 'error on request')
        });

        req.on('response', function (res) {
            var stream = this; // `this` is `req`, which is a stream

            if (res.statusCode !== 200) {
                console.log('err status code')
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
                var chunkSize = 4096 - item.link - 15
                var messageNumber = Math.ceil(text.length / chunkSize)
                for(var i = 0; i < messageNumber; i++) {
                    var sendText
                    if(text.length - i*chunkSize < chunkSize) {
                        sendText = text.slice(i*chunkSize, text.length - i*chunkSize)
                    } else {
                        sendText = text.slice(i*chunkSize, (i+1)*chunkSize)
                    }
                    try {
                        if(sendText.length > 0) {
                            sendText = 'لینک پست: ' + item.link + '\n' + sendText
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

function ValidURL(str) {
    var pattern = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/;
    if(!pattern.test(str)) {
        return false;
    } else {
        return true;
    }
}