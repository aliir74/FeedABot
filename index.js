const TelegramBot = require('node-telegram-bot-api');

// replace the value below with the Telegram token you receive from @BotFather
const token = '330066489:AAG1eTsaceto4eUrsKoE1TUngTX3UV17j8k';

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});
var feed = []
let id = 0

bot.onText(/\/start/, (msg) => {
    /* bot.sendMessage(msg.chat.id, "گزینه‌ی مورد نظر خود را انتخاب کنید.", {
        "reply_markup": {
            "keyboard": [["ساخت فرم"]]
        }
    }) */
    id = msg.chat.id
    feed[id] = []
    bot.sendMessage(id, id)
})



var FeedParser = require('feedparser');
var request = require('request'); // for fetching the feed
var htmlToText = require('html-to-text');
var AsyncPolling = require('async-polling');


var req = request('http://beforethedawn.blogfa.com/rss')


var polling = AsyncPolling(function (end) {
    console.log(id)
    console.log(feed[id])
    req = request('http://goings0lo.mihanblog.com/post/rss/')
    var feedparser = new FeedParser([]);
    console.log('new request')

    req.on('error', function (error) {
        end('error on request')
        //bot.sendMessage(id, 'error on request')
    });

    req.on('response', function (res) {
        var stream = this; // `this` is `req`, which is a stream

        if (res.statusCode !== 200) {
            bot.sendMessage(id, 'err'+str(new Error('Bad status code')))
        }
        else {
            stream.pipe(feedparser);
            end(null, feedparser)
        }
    });


}, 10000);

polling.on('error', function (error) {
    console.log('in polling err')
});
polling.on('result', function (feedparser) {
    console.log('in result')


    feedparser.on('error', function (error) {
        bot.sendMessage(id, 'feedparser err')
        // always handle errors
    });

    feedparser.on('readable', function () {
        //console.log('readble')
        // This is where the action is!
        var stream = this; // `this` is `feedparser`, which is a stream
        var meta = this.meta; // **NOTE** the "meta" is always available in the context of the feedparser instance
        var item;

        while (item = stream.read()) {
            //bot.sendMessage(id, '10')
            var link = item.link
            if(feed[id].find(function (e) {
                    return e == link
                }) != undefined) {
                continue
            }
            feed[id].push(item.link)

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
                    if(sendText.length > 0)
                        bot.sendMessage(id, sendText)
                }
                catch (error) {
                    console.log("Something went wrong: ", error);
                }
            }
        }
    });
});

polling.run(); // Let's start polling.