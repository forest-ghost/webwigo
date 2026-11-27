require "Wherigo"
Player = Wherigo.Player
ZonePoint = Wherigo.ZonePoint

cart = Wherigo.ZCartridge()
cart.Name = "Synthetic gameplay fixture"
cart.StartingLocation = ZonePoint(0.05, 0.04, 0)

local zone = Wherigo.Zone(cart)
zone.Name = "Test zone"
zone.Active = true
zone.Visible = true
zone.OriginalPoint = ZonePoint(0.05, 0.05, 0)
zone.Points = {
  ZonePoint(0.048, 0.048, 0), ZonePoint(0.052, 0.048, 0),
  ZonePoint(0.052, 0.052, 0), ZonePoint(0.048, 0.052, 0)
}

function zone:OnEnter()
  Wherigo.MessageBox{Text = "Entered the test zone"}
end

local task = Wherigo.ZTask(cart)
task.Name = "Test task"
task.Description = "The requested task details"
task.Active = true
task.Visible = true

local tool = Wherigo.ZItem(cart)
tool.Name = "Test tool"
tool.Visible = true
local token = Wherigo.ZItem(cart)
token.Name = "Test token"
token.Visible = true

tool.Commands = {
  _use = Wherigo.ZCommand{Text = "Use the tool", CmdWith = true, Enabled = true}
}
tool.Commands._use.WorksWithAll = false
tool.Commands._use.WorksWithList = {token}

local choice = Wherigo.ZInput(cart)
choice.Text = "Choose a meal"
choice.InputType = "MultipleChoice"
choice.Choices = {"Fish & chips", "Pasta"}

function choice:OnGetInput(answer)
  Wherigo.MessageBox{Text = answer == "Fish & chips" and "Choice matched" or "Choice changed"}
end

local input = Wherigo.ZInput(cart)
input.Text = "Enter a quoted answer"
input.InputType = "Text"

function input:OnGetInput(answer)
  if answer == [[I said "hello"]] then
    Wherigo.GetInput(choice)
  else
    Wherigo.MessageBox{Text = "Text changed"}
  end
end

function tool:On_use(target)
  if target == token then
    Wherigo.MessageBox{
      Text = "Used the tool on the token",
      Callback = function() Wherigo.GetInput(input) end
    }
  end
end

local countdown = Wherigo.ZTimer(cart)
countdown.Name = "Restart check"
countdown.Duration = 2
countdown.Type = "Countdown"

function countdown:OnTick()
  Wherigo.MessageBox{Text = "Countdown finished"}
end

function cart:OnStart()
  tool:MoveTo(Player)
  token:MoveTo(Player)
  Wherigo.MessageBox{
    Text = "Choose a test",
    Buttons = {"Gameplay", "Timer"},
    Callback = function(button)
      if button == "Button1" then
        Wherigo.MessageBox{
          Text = "Open the task",
          Callback = function()
            Wherigo.ShowScreen(Wherigo.DETAILSCREEN, task)
          end
        }
      else
        countdown:Start()
        Wherigo.MessageBox{
          Text = "Restart countdown",
          Callback = function()
            countdown:Stop()
            countdown:Start()
          end
        }
      end
    end
  }
end

return cart
