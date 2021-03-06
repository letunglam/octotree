(function() {
  const PREFIX = 'octotree'
      , TOKEN  = 'octotree.github_access_token'
      , SHOWN  = 'octotree.shown'
      , RESERVED_USER_NAMES = [
          'settings', 'orgs', 'organizations', 
          'site', 'blog', 'about',      
          'styleguide', 'showcases', 'trending',
          'stars', 'dashboard', 'notifications'
        ]
      , RESERVED_REPO_NAMES = ['followers', 'following']

  var $html    = $('html')
    , $sidebar = $('<nav class="octotree_sidebar">' +
                     '<div class="octotree_header"/>' +
                     '<div class="octotree_treeview"/>' +
                     '<form class="octotree_options">' +
                       '<div class="message"/>' +
                       '<div>' +
                         '<input name="token" type="text" placeholder="Paste access token here" autocomplete="off"/>' +
                       '</div>' +
                       '<div>' +
                         '<button type="submit" class="button">Save</button>' +
                         '<a href="https://github.com/buunguyen/octotree#github-api-rate-limit" target="_blank">Why need access token?</a>' +
                       '</div>' +
                       '<div class="error"/>' +
                     '</form>' +
                   '</nav>')
    , $treeView  = $sidebar.find('.octotree_treeview')
    , $optsFrm   = $sidebar.find('.octotree_options')
    , $toggleBtn = $('<a class="octotree_toggle button"><span/></a>'+
                      '<div class="popover">' +
                      '<div class="arrow"/>' +
                      '<div class="popover-content">Vivamus sagittis lacus vel augue laoreet rutrum faucibus.' +
                      '</div></div>')
    , $dummyDiv  = $('<div/>')
    , store      = new Storage()
    , currentRepo    = false

  $(document).ready(function() {

    // initializes DOM
    $('body').append($sidebar).append($toggleBtn)
    $optsFrm.submit(saveToken)
    $toggleBtn.click(toggleSidebar)
    key('⌘+b, ctrl+b', toggleSidebar)

    // When navigating from non-code pages (i.e. Pulls, Issues) to code page
    // GitHub doesn't reload the page but uses pjax. Need to detect and load Octotree.
    var href, hash
    function detectLocationChange() {
      if (location.href !== href || location.hash != hash) {
        href = location.href
        hash = location.hash
        loadRepo()
      }
      setTimeout(detectLocationChange, 200)
    }
    detectLocationChange()
  })

  function loadRepo(reload) {
    var repo = getRepoFromPath()
      , repoChanged = JSON.stringify(repo) !== JSON.stringify(currentRepo)

    if (repo) {
      $toggleBtn.show()
      $sidebar.show()
      if (repoChanged || reload) {
        currentRepo = repo
        fetchData(repo, function(err, tree) {
          if (err) return onFetchError(err)
          renderTree(repo, tree, selectTreeNode)
        })
      } else selectTreeNode()
    } else {
      $toggleBtn.hide()
      $sidebar.hide()
    }
  }

  function selectTreeNode() {
    if ($treeView.is(':hidden')) return

    var tree = $.jstree.reference($treeView)
      , path = location.pathname

    tree.deselect_all()

    // e.g. converts /buunguyen/octotree/type/branch/path to path
    var match = path.match(/(?:[^\/]+\/){4}(.*)/)
    if (match) tree.select_node(PREFIX + decodeURIComponent(match[1]))
  }

  function getRepoFromPath() {
    // 404 page, skip
    if ($('#parallax_wrapper').length) return false

    // (username)/(reponame)[/(subpart)]
    var match = location.pathname.match(/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?/)
    if (!match) return false
     
    // Not a repository, skip
    if (~RESERVED_USER_NAMES.indexOf(match[1])) return false
    if (~RESERVED_REPO_NAMES.indexOf(match[2])) return false

    // Not a code page, skip
    if (match[3] && !~['tree', 'blob'].indexOf(match[3])) return false

    var branch = $('*[data-master-branch]').data('ref') || 
                 $('*[data-master-branch] > .js-select-button').text() || 
                 'master'
    return { 
      username : match[1], 
      reponame : match[2],
      branch   : branch
    }
  }

  function fetchData(repo, done) {
    var github  = new Github({ token: store.get(TOKEN) })
      , api     = github.getRepo(repo.username, repo.reponame)
      , root    = []
      , folders = { '': root }

    api.getTree(encodeURIComponent(repo.branch) + '?recursive=true', function(err, tree) {
      if (err) return done(err)
      tree.forEach(function(item) {
        var path   = item.path
          , type   = item.type
          , index  = path.lastIndexOf('/')
          , name   = path.substring(index + 1)
          , folder = folders[path.substring(0, index)]
          , url    = '/' + repo.username + '/' + repo.reponame + '/' + type + '/' + repo.branch + '/' + path

        folder.push(item)
        item.id   = PREFIX + path
        item.text = $dummyDiv.text(name).html() // sanitizes, closes #9
        item.icon = type // use `type` as class name for tree node
        if (type === 'tree') {
          folders[item.path] = item.children = []
          item.a_attr = { href: '#' }
        }
        else if (type === 'blob') {
          item.a_attr = { href: url }
        }
      })

      done(null, sort(root))

      function sort(folder) {
        folder.sort(function(a, b) {
          if (a.type === b.type) return a.text.localeCompare(b.text)
          return a.type === 'tree' ? -1 : 1
        })
        folder.forEach(function(item) {
          if (item.type === 'tree') sort(item.children)
        })
        return folder
      }
    })
  }

  function onFetchError(err) {
    var header = 'Error: ' + err.error
      , token  = store.get(TOKEN)
      , message

    $optsFrm.show()
    $treeView.hide()
    if (token) $optsFrm.find('[name="token"]').val(token)

    switch (err.error) {
      case 401:
        header  = 'Invalid token!'
        message = 'The token is invalid. Follow <a href="https://github.com/settings/tokens/new" target="_blank">this link</a> to create a new token and paste it in the textbox below.'
        break
      case 409:
        header  = 'Empty repository!'
        message = 'This repository is empty.'
        break
      case 404:
        header  = 'Private or invalid repository!'
        message = token 
          ? 'You are not allowed to access this repository.'
          : 'Accessing private repositories requires a GitHub access token. Follow <a href="https://github.com/settings/tokens/new" target="_blank">this link</a> to create one and paste it in the textbox below.'
        break
      case 403:
        if (~err.request.getAllResponseHeaders().indexOf('X-RateLimit-Remaining: 0')) {
          header  = 'API limit exceeded!'
          message = token 
            ? 'You have exceeded the API hourly limit, please create a new access token.'
            : 'You have exceeded the GitHub API hourly limit and need GitHub access token to make extra requests. Follow <a href="https://github.com/settings/tokens/new" target="_blank">this link</a> to create one and paste it in the textbox below.'
        }
        break
    }

    $optsFrm.find('.message').html(message)
    updateSidebar('<div class="octotree_header_error">' + header + '</div>')
  }

  function renderTree(repo, tree, cb) {
    $optsFrm.hide()
    $treeView.show().empty()
      .jstree({
        core    : { data: tree, animation: 100, themes : { responsive : false } },
        plugins : ['wholerow', 'state'],
        state   : { key : PREFIX + '.' + repo.username + '/' + repo.reponame }
      })
      .on('click.jstree', '.jstree-open>a', function() {
        $.jstree.reference(this).close_node(this)
      })
      .on('click.jstree', '.jstree-closed>a', function() {
        $.jstree.reference(this).open_node(this)
      })
      .on('click', function(e) {
        var $target = $(e.target)
        if ($target.is('a.jstree-anchor') && $target.children(':first').hasClass('blob')) {
          $.pjax({ 
            url       : $target.attr('href'), 
            timeout   : 5000, //gives it more time, should really have a progress indicator...
            container : $('#js-repo-pjax-container') 
          })
        }
      })
      .on('ready.jstree', function() {
        var headerText = '<div class="octotree_header_repo">' + 
                           repo.username + ' / ' + repo.reponame + 
                         '</div>' +
                         '<div class="octotree_header_branch">' + 
                           repo.branch + 
                         '</div>'
        updateSidebar(headerText)
        cb()
      })
  }

  function updateSidebar(header) {
    $sidebar.find('.octotree_header').html(header)

    // Shows sidebar when:
    // 1. First time after extension is installed
    // 2. If it was previously shown (TODO: many seem not to like it)
    if (store.get(SHOWN) !== false) {
      $html.addClass(PREFIX)
      store.set(SHOWN, true)
    }
  }

  function toggleSidebar() {
    var shown = store.get(SHOWN)
    if (shown) $html.removeClass(PREFIX)
    else $html.addClass(PREFIX)
    store.set(SHOWN, !shown)
  } 

  function saveToken(event) {
    event.preventDefault()

    var $error = $optsFrm.find('.error').text('')
      , token  = $optsFrm.find('[name="token"]').val()

    if (!token) return $error.text('Token is required')

    store.set(TOKEN, token)
    loadRepo(true)
  }

  function Storage() {
    this.get = function(key) {
      var val = localStorage.getItem(key)
      try {
        return JSON.parse(val)
      } catch (e) {
        return val
      }
    }
    this.set = function(key, val) {
      return localStorage.setItem(key, JSON.stringify(val))
    }
  }
})()